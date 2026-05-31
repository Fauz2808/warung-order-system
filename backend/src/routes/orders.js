// src/routes/orders.js
// Endpoint untuk order dari customer + update status dari kasir

const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');

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

// GET /api/orders — ambil order hari ini (WIB) untuk kasir/dapur
router.get('/', async (req, res) => {
  try {
    const { status, tableId, floor, date } = req.query;

    // Filter tanggal — default: hari ini WIB (UTC+7)
    // date param format: YYYY-MM-DD (WIB), atau 'all' untuk semua
    let dateFilter = {};
    if (date !== 'all') {
      const targetDate = date || null;
      // Midnight WIB = UTC-7 jam sebelumnya
      const todayWIB = targetDate
        ? new Date(`${targetDate}T00:00:00+07:00`)
        : (() => {
            const now = new Date();
            // Midnight WIB hari ini
            const wibOffset = 7 * 60 * 60 * 1000;
            const wibNow = new Date(now.getTime() + wibOffset);
            return new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()) - wibOffset);
          })();
      const tomorrowWIB = new Date(todayWIB.getTime() + 24 * 60 * 60 * 1000);
      dateFilter = { createdAt: { gte: todayWIB, lt: tomorrowWIB } };
    }

    const orders = await prisma.order.findMany({
      where: {
        ...dateFilter,
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

// GET /api/orders/pending-yesterday — order kemarin yang belum selesai
router.get('/pending-yesterday', async (req, res) => {
  try {
    const wibOffset = 7 * 60 * 60 * 1000;
    const now = new Date();
    const wibNow = new Date(now.getTime() + wibOffset);
    const todayMidnightWIB = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()) - wibOffset);
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { lt: todayMidnightWIB },
        status: { in: ['pending', 'preparing'] },
      },
      include: { table: true, items: { include: { menu: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: orders, count: orders.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data' });
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
// Body: { notes: "...", paymentMethod: "cash" | "qris" }
router.patch('/:id/mark-paid', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { notes, paymentMethod } = req.body;

    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
    }

    const updateData = {
      isPaid: true,
      paymentMethod: paymentMethod === 'qris' ? 'qris' : 'cash',
    };
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

// PUT /api/orders/:id/items — edit item order (kasir)
// Ganti semua items, rekonsiliasi stok, recalculate total
router.put('/:id/items', authMiddleware, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Items tidak boleh kosong' });
    }

    // Ambil order lama beserta item-item nya
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });

    // Ambil harga menu baru
    const menuIds = [...new Set(items.filter(i => i.menuId).map(i => i.menuId))];
    const menus   = await prisma.menu.findMany({ where: { id: { in: menuIds } } });
    const menuMap = Object.fromEntries(menus.map(m => [m.id, m]));

    // Cek semua menu tersedia
    for (const item of items.filter(i => i.menuId)) {
      if (!menuMap[item.menuId]) {
        return res.status(400).json({ success: false, message: `Menu ID ${item.menuId} tidak ditemukan` });
      }
    }

    // Rekonsiliasi stok: hitung delta qty per menuId
    const oldQty = {};
    for (const oi of existing.items) {
      if (oi.menuId) oldQty[oi.menuId] = (oldQty[oi.menuId] || 0) + oi.quantity;
    }
    const newQty = {};
    for (const ni of items.filter(i => i.menuId)) {
      newQty[ni.menuId] = (newQty[ni.menuId] || 0) + ni.quantity;
    }

    // Hitung total baru
    const totalAmount = items.reduce((sum, item) => {
      if (!item.menuId) return sum + (item.price || 0) * item.quantity;
      const base = menuMap[item.menuId].price;
      const espresso = (item.additionalEspressoShots || 0) * (item.additionalEspressoPrice || 0);
      return sum + (base + espresso) * item.quantity;
    }, 0);

    // Transaction: hapus items lama, buat items baru, update total, rekonsiliasi stok
    const allMenuIds = new Set([...Object.keys(oldQty), ...Object.keys(newQty)].map(Number));
    const stockUpdates = [];
    for (const mid of allMenuIds) {
      const menu = menuMap[mid];
      if (!menu || menu.stock === null) continue;
      const delta = (newQty[mid] || 0) - (oldQty[mid] || 0);
      if (delta === 0) continue;
      const newStock = Math.max(0, menu.stock - delta);
      stockUpdates.push(prisma.menu.update({
        where: { id: mid },
        data: { stock: newStock, ...(newStock === 0 ? { isAvailable: false } : {}) },
      }));
    }

    await prisma.$transaction([
      prisma.orderItem.deleteMany({ where: { orderId } }),
      prisma.order.update({
        where: { id: orderId },
        data: {
          totalAmount,
          items: {
            create: items.map(item => ({
              menuId:                  item.menuId || null,
              menuName:                item.menuId ? menuMap[item.menuId].name : (item.menuName || '-'),
              quantity:                item.quantity,
              price:                   item.menuId ? menuMap[item.menuId].price : (item.price || 0),
              notes:                   item.notes || null,
              additionalEspressoShots: item.additionalEspressoShots || 0,
              additionalEspressoPrice: item.additionalEspressoPrice || 0,
            })),
          },
        },
      }),
      ...stockUpdates,
    ]);

    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      include: { table: true, items: { include: { menu: true } } },
    });

    if (req.io) req.io.emit('order:status_update', { orderId });

    res.json({ success: true, data: updated, message: 'Order berhasil diubah' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal mengubah order' });
  }
});

module.exports = router;
