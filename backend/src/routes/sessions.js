// src/routes/sessions.js
// Bon per meja (open tab) — daftar bon terbuka & tutup bon (bayar) untuk kasir

const express = require('express');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const fmt = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const orderInclude = { items: { include: { menu: true, modifiers: true } } };

// Hitung total berjalan bon (order yang tidak dibatalkan)
const runningTotalOf = (orders) =>
  (orders || []).filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.totalAmount, 0);

// GET /api/sessions?status=open — daftar bon (auth kasir)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const status = req.query.status || 'open';
    const sessions = await prisma.tableSession.findMany({
      where: status === 'all' ? {} : { status },
      include: {
        table: true,
        orders: { include: orderInclude, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { openedAt: 'asc' },
    });
    const data = sessions.map((s) => ({ ...s, runningTotal: runningTotalOf(s.orders) }));
    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal mengambil data bon' });
  }
});

// POST /api/sessions/:id/call — customer memanggil kasir (public)
router.post('/:id/call', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const session = await prisma.tableSession.findUnique({ where: { id }, include: { table: true } });
    if (!session || session.status !== 'open') {
      return res.status(404).json({ success: false, message: 'Bon tidak ditemukan / sudah ditutup' });
    }
    const updated = await prisma.tableSession.update({
      where: { id },
      data: { callRequestedAt: new Date() },
    });
    if (req.io) {
      req.io.emit('session:call', { sessionId: id, tableId: session.tableId, tableNumber: session.table?.number });
    }
    res.json({ success: true, data: updated, message: 'Kasir sedang menuju mejamu' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal memanggil kasir' });
  }
});

// POST /api/sessions/:id/ack-call — kasir menandai panggilan sudah dilayani (auth)
router.post('/:id/ack-call', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await prisma.tableSession.update({
      where: { id },
      data: { callRequestedAt: null },
    });
    if (req.io) req.io.emit('session:call_ack', { sessionId: id });
    res.json({ success: true, data: updated });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Bon tidak ditemukan' });
    res.status(500).json({ success: false, message: 'Gagal memperbarui panggilan' });
  }
});

// POST /api/sessions/:id/close — tutup bon + catat pembayaran (auth kasir)
// Body: { paymentMethod: 'cash'|'qris'|'split', cashAmount?, qrisAmount?, notes? }
router.post('/:id/close', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { paymentMethod, cashAmount, qrisAmount, notes } = req.body;

    const session = await prisma.tableSession.findUnique({
      where: { id },
      include: { orders: true },
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Bon tidak ditemukan' });
    }
    if (session.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Bon sudah ditutup' });
    }

    const validMethods = ['cash', 'qris', 'split'];
    const method = validMethods.includes(paymentMethod) ? paymentMethod : 'cash';

    const activeOrders = session.orders.filter((o) => o.status !== 'cancelled');
    const total = runningTotalOf(session.orders);

    // Susun catatan pembayaran + validasi pisah bayar
    let payNote = notes || null;
    if (method === 'split') {
      const cash = parseInt(cashAmount) || 0;
      const qris = parseInt(qrisAmount) || 0;
      if (cash <= 0 || qris <= 0) {
        return res.status(400).json({ success: false, message: 'Nominal cash dan QRIS harus lebih dari 0' });
      }
      if (cash + qris !== total) {
        return res.status(400).json({ success: false, message: 'Total pembayaran tidak sesuai dengan tagihan' });
      }
      payNote = `[Pisah Bayar: Cash ${fmt(cash)} + QRIS ${fmt(qris)}]`;
    } else if (!payNote) {
      payNote = method === 'qris' ? '[Bayar QRIS]' : '[Bayar Cash]';
    }

    const activeIds = activeOrders.map((o) => o.id);
    // Order yang masih perlu dimasak (belum 'done'). Status dapur TIDAK diubah saat tutup bon.
    const remainingToPrepare = activeOrders.filter((o) => o.status !== 'done').length;

    const ops = [
      // Tandai order aktif di bon: LUNAS saja — status dapur dibiarkan apa adanya
      // (dapur yang menandai 'selesai' manual saat masakan benar-benar jadi).
      prisma.order.updateMany({
        where: { id: { in: activeIds } },
        data: { isPaid: true, paymentMethod: method },
      }),
      // Tutup sesi + catat pembayaran
      prisma.tableSession.update({
        where: { id },
        data: {
          status: 'closed',
          closedAt: new Date(),
          callRequestedAt: null,
          isPaid: true,
          paymentMethod: method,
          notes: payNote,
        },
      }),
    ];
    // Meja hanya dikosongkan kalau semua pesanan sudah selesai dimasak. Kalau masih
    // ada yang diproses, meja bebas otomatis saat order terakhir ditandai 'done'.
    if (remainingToPrepare === 0) {
      ops.push(prisma.table.update({ where: { id: session.tableId }, data: { isOccupied: false } }));
    }
    await prisma.$transaction(ops);

    const updated = await prisma.tableSession.findUnique({
      where: { id },
      include: { table: true, orders: { include: orderInclude } },
    });

    if (req.io) {
      req.io.emit('session:closed', { sessionId: id, tableId: session.tableId });
      req.io.emit('order:status_update', { sessionId: id });
    }

    res.json({ success: true, data: updated, message: 'Bon ditutup & pembayaran tercatat' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal menutup bon' });
  }
});

module.exports = router;
