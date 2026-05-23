// src/routes/orders.js
// Endpoint untuk order dari customer + update status dari kasir

const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');

const router = express.Router();

// Validasi order baru dari customer
const createOrderSchema = z.object({
  tableId: z.number().int().positive('tableId wajib diisi'),
  orderType: z.enum(['dine-in', 'take-away']).default('dine-in'),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        menuId: z.number().int().positive(),
        quantity: z.number().int().min(1, 'Quantity minimal 1'),
        notes: z.string().optional(),
      })
    )
    .min(1, 'Order harus punya minimal 1 item'),
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'preparing', 'ready', 'done', 'cancelled'], {
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

    const { tableId, orderType, notes, items } = parsed.data;

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
      return sum + menuMap[item.menuId].price * item.quantity;
    }, 0);

    // Buat order + items + kurangi stok dalam satu transaction
    const [order] = await prisma.$transaction([
      prisma.order.create({
        data: {
          tableId,
          orderType,
          notes,
          totalAmount,
          items: {
            create: items.map((item) => ({
              menuId: item.menuId,
              quantity: item.quantity,
              price: menuMap[item.menuId].price,
              notes: item.notes,
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
    // req.io diinjeksi dari index.js
    if (req.io) {
      req.io.emit('order:new', order);
    }

    res.status(201).json({
      success: true,
      data: order,
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

module.exports = router;
