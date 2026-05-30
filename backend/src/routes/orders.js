// src/routes/orders.js
// Endpoint untuk order dari customer + update status dari kasir

const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');

const router = express.Router();

// Validasi order baru dari customer
const createOrderSchema = z.object({
  tableId:      z.number().int().positive('tableId wajib diisi'),
  orderType:    z.enum(['dine-in', 'take-away']).default('dine-in'),
  notes:        z.string().optional(),
  customerName: z.string().optional(),       // nama customer (opsional)
  isPaid:       z.boolean().default(false),  // bayar sekarang = true
  items: z
    .array(
      z.object({
        menuId: z.number().int().positive(),
        quantity: z.number().int().min(1, 'Quantity minimal 1'),
        notes: z.string().optional(),
        additionalEspressoShots: z.number().int().min(0).optional().default(0),
        additionalEspressoPrice: z.number().int().min(0).optional().default(0),
      })
    )
    .min(1, 'Order harus punya minimal 1 item'),
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'preparing', 'done', 'cancelled'], {
    errorMap: () => ({ message: 'Status tidak valid' }),
  }),
});

// GET /api/orders — ambil semua order (untuk kasir/dapur)
router.get('/', async (req, res) => {
  try {
    const { status, tableId, floor } = req.query;

    const orders = await prisma.order.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(tableId ? { tableId: parseInt(tableId) } : {}),
        ...(floor ? { table: { floor: parseInt(floor) } } : {}),
      },
      include: {
        table: true,
        items: {
          include: { menu: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data order' });
  }
});

// GET /api/orders/:id — detail satu order
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        table: true,
        items: { include: { menu: true } },
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data order' });
  }
});

// POST /api/orders — buat order baru (dari customer, no auth)
router.post('/', async (req, res) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data tidak valid',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { tableId, orderType, notes, customerName, isPaid, items } = parsed.data;

    // Cek jam operasional warung
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (settings) {
      const { openTime, closeTime, isForceClose } = settings;
      if (isForceClose) {
        return res.status(403).json({ success: false, message: 'Warung sedang tutup. Silakan datang kembali saat jam operasional.' });
      }
      // Cek jam WIB
      const now = new Date();
      const wibMinutes = ((now.getUTCHours() * 60 + now.getUTCMinutes()) + 7 * 60) % (24 * 60);
      const [oh, om] = openTime.split(':').map(Number);
      const [ch, cm] = closeTime.split(':').map(Number);
      const openMin  = oh * 60 + om;
      const closeMin = ch * 60 + cm;
      const isOpen   = openMin <= closeMin
        ? wibMinutes >= openMin && wibMinutes < closeMin
        : wibMinutes >= openMin || wibMinutes < closeMin;
      if (!isOpen) {
        return res.status(403).json({
          success: false,
          message: `Warung tutup. Jam buka ${openTime}–${closeTime} WIB.`,
        });
      }
    }

    // Cek meja ada
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table) {
      return res.status(404).json({ success: false, message: 'Meja tidak ditemukan' });
    }

    // Ambil harga menu saat ini (snapshot)
    const menuIds = items.map((i) => i.menuId);
    const menus = await prisma.menu.findMany({
      where: { id: { in: menuIds }, isAvailable: true },
    });

    // Cek semua menu tersedia
    if (menus.length !== menuIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Beberapa menu tidak tersedia atau tidak ditemukan',
      });
    }

    const menuMap = Object.fromEntries(menus.map((m) => [m.id, m]));

    // Cek stok mencukupi (stock null = unlimited)
    for (const item of items) {
      const menu = menuMap[item.menuId];
      if (menu.stock !== null && menu.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Stok ${menu.name} tidak mencukupi (tersisa ${menu.stock})`,
        });
      }
    }

    // Hitung total
    const totalAmount = items.reduce((sum, item) => {
      const basePrice = menuMap[item.menuId].price;
      const espressoExtra = (item.additionalEspressoShots || 0) * (item.additionalEspressoPrice || 0);
      return sum + (basePrice + espressoExtra) * item.quantity;
    }, 0);

    // Buat order + items + kurangi stok dalam satu transaction
    const [order] = await prisma.$transaction([
      prisma.order.create({
        data: {
          tableId,
          orderType,
          notes,
          customerName: customerName || null,
          isPaid,
          totalAmount,
          items: {
            create: items.map((item) => ({
              menuId: item.menuId,
              menuName: menuMap[item.menuId].name,
              quantity: item.quantity,
              price: menuMap[item.menuId].price,
              notes: item.notes,
              additionalEspressoShots: item.additionalEspressoShots || 0,
              additionalEspressoPrice: item.additionalEspressoPrice || 0,
            })),
          },
        },
        include: {
          table: true,
          items: { include: { menu: true } },
        },
      }),
      // Kurangi stok per menu item (hanya yang punya stock != null)
      ...items
        .filter((item) => menuMap[item.menuId].stock !== null)
        .map((item) => {
          const newStock = Math.max(0, menuMap[item.menuId].stock - item.quantity);
          return prisma.menu.update({
            where: { id: item.menuId },
            data: {
              stock: newStock,
              // Auto-unavailable kalau stok habis
              ...(newStock === 0 ? { isAvailable: false } : {}),
            },
          });
        }),
    ]);

    // Update status meja jadi occupied
    await prisma.table.update({
      where: { id: tableId },
      data: { isOccupied: true },
    });

    // Kirim event real-time ke kasir via Socket.IO
    if (req.io) {
      req.io.emit('order:new', order);
    }

    // Hitung estimasi waktu tunggu berdasarkan antrian aktif
    const activeCount = await prisma.order.count({
      where: { status: { in: ['pending', 'preparing'] } },
    });
    // 5 menit per order di antrian, minimum 5 menit, maksimum 30 menit
    const estimatedMinutes = Math.min(30, Math.max(5, activeCount * 5));

    res.status(201).json({
      success: true,
      data: { ...order, estimatedMinutes },
      message: 'Pesanan berhasil dikirim!',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal membuat order' });
  }
});

// PUT /api/orders/:id/status — update status order (kasir/dapur)
router.put('/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Status tidak valid',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const order = await prisma.order.update({
      where: { id },
      data: { status: parsed.data.status },
      include: { table: true, items: { include: { menu: true } } },
    });

    // Jika order selesai (done), cek apakah semua order di meja sudah done
    if (parsed.data.status === 'done') {
      const activeOrders = await prisma.order.count({
        where: { tableId: order.tableId, status: { not: 'done' } },
      });
      if (activeOrders === 0) {
        await prisma.table.update({
          where: { id: order.tableId },
          data: { isOccupied: false },
        });
      }
    }

    // Kirim update real-time
    if (req.io) {
      req.io.emit('order:status_update', { orderId: id, status: parsed.data.status, order });
    }

    res.json({ success: true, data: order, message: `Status order diperbarui: ${parsed.data.status}` });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
    }
    res.status(500).json({ success: false, message: 'Gagal memperbarui status order' });
  }
});

// PATCH /api/orders/:id/mark-paid — tandai order sudah lunas (kasir)
// Body: { notes: "..." } — opsional, untuk catat metode bayar
router.patch('/:id/mark-paid', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { notes } = req.body; // opsional: "[Bayar Cash: Rp50.000, Kembalian: Rp0]"

    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
    }

    const updateData = { isPaid: true };
    // Append catatan pembayaran ke notes yang sudah ada
    if (notes) {
      updateData.notes = existing.notes
        ? `${existing.notes} · ${notes}`
        : notes;
    }

    const order = await prisma.order.update({
      where: { id },
      data: updateData,
      include: { table: true, items: { include: { menu: true } } },
    });

    if (req.io) {
      req.io.emit('order:paid', { orderId: id, order });
    }

    res.json({ success: true, data: order, message: 'Order ditandai sudah lunas' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal memperbarui status bayar' });
  }
});

// PUT /api/orders/bulk-status — update status banyak order sekaligus (kasir)
// Body: { ids: [1,2,3], status: "preparing" }
router.put('/bulk-status', async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return res.status(400).json({ success: false, message: 'ids dan status wajib diisi' });
    }
    const validStatuses = ['pending', 'preparing', 'done', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }

    await prisma.order.updateMany({
      where: { id: { in: ids.map(Number) } },
      data: { status, updatedAt: new Date() },
    });

    if (req.io) {
      req.io.emit('order:bulk_status_update', { ids, status });
    }

    res.json({ success: true, message: `${ids.length} order diperbarui ke ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal update bulk status' });
  }
});

module.exports = router;
