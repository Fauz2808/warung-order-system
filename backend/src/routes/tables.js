// src/routes/tables.js
// Endpoint untuk kelola meja

const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const authMiddleware  = require('../middleware/auth');
const ownerMiddleware = require('../middleware/owner');

const router = express.Router();

const tableSchema = z.object({
  number: z.number().int().positive('Nomor meja harus lebih dari 0'),
  floor: z.number().int().positive('Lantai harus lebih dari 0').default(1),
});

// GET /api/tables — ambil semua meja
router.get('/', async (req, res) => {
  try {
    const tables = await prisma.table.findMany({
      orderBy: { number: 'asc' },
    });
    res.json({ success: true, data: tables });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data meja' });
  }
});

// GET /api/tables/:id — detail satu meja
// ⚠️  Lookup by table NUMBER (bukan primary key id)
//     supaya URL /meja/1 = Meja nomor 1, bukan row id=1
router.get('/:id', async (req, res) => {
  try {
    const number = parseInt(req.params.id);
    const table = await prisma.table.findUnique({
      where: { number },           // ← pakai number (unique field)
      include: {
        // tampilkan order aktif di meja ini
        orders: {
          where: { status: { not: 'done' } },
          include: { items: { include: { menu: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!table) {
      return res.status(404).json({ success: false, message: 'Meja tidak ditemukan' });
    }

    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data meja' });
  }
});

// GET /api/tables/:id/session — bon (open tab) untuk meja (by NUMBER), public
// Dipakai halaman customer untuk resume/gabung bon & polling status.
// phase 'open'     = bon masih berjalan (bisa nambah, bayar nanti)
// phase 'awaiting' = sudah bayar (bon ditutup) tapi masih ada pesanan diproses dapur
router.get('/:id/session', async (req, res) => {
  try {
    const number = parseInt(req.params.id);
    const table = await prisma.table.findUnique({ where: { number } });
    if (!table) {
      return res.status(404).json({ success: false, message: 'Meja tidak ditemukan' });
    }

    const withOrders = {
      orders: {
        include: { items: { include: { menu: true, modifiers: true } } },
        orderBy: { createdAt: 'asc' },
      },
    };

    // 1. Bon yang masih terbuka
    let session = await prisma.tableSession.findFirst({
      where: { tableId: table.id, status: 'open' },
      orderBy: { openedAt: 'desc' },
      include: withOrders,
    });
    let phase = 'open';

    // 2. Kalau tidak ada: bon yang baru ditutup (<4 jam) tapi masih ada pesanan
    //    belum selesai dimasak → fase "menunggu dapur" (sudah dibayar).
    if (!session) {
      const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const awaiting = await prisma.tableSession.findFirst({
        where: {
          tableId: table.id,
          status: 'closed',
          closedAt: { gte: cutoff },
          orders: { some: { status: { notIn: ['done', 'cancelled'] } } },
        },
        orderBy: { closedAt: 'desc' },
        include: withOrders,
      });
      if (awaiting) { session = awaiting; phase = 'awaiting'; }
    }

    if (!session) {
      return res.json({ success: true, data: null });
    }

    const runningTotal = session.orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((s, o) => s + o.totalAmount, 0);

    res.json({ success: true, data: { ...session, phase, runningTotal } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal mengambil data bon meja' });
  }
});

// POST /api/tables — tambah meja baru (kasir & owner)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const parsed = tableSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data tidak valid',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const table = await prisma.table.create({ data: parsed.data });
    res.status(201).json({ success: true, data: table, message: 'Meja berhasil ditambahkan' });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Nomor meja sudah ada' });
    }
    res.status(500).json({ success: false, message: 'Gagal menambahkan meja' });
  }
});

// PUT /api/tables/:id — edit meja (kasir & owner)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const parsed = tableSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data tidak valid',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const table = await prisma.table.update({ where: { id }, data: parsed.data });
    res.json({ success: true, data: table, message: 'Meja berhasil diperbarui' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Meja tidak ditemukan' });
    }
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Nomor meja sudah ada' });
    }
    res.status(500).json({ success: false, message: 'Gagal memperbarui meja' });
  }
});

// DELETE /api/tables/:id — hapus meja (kasir & owner)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.table.delete({ where: { id } });
    res.json({ success: true, message: 'Meja berhasil dihapus' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Meja tidak ditemukan' });
    }
    res.status(500).json({ success: false, message: 'Gagal menghapus meja' });
  }
});

module.exports = router;
