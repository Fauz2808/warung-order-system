// src/routes/reports.js
// Endpoint laporan penjualan

const express = require('express');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Semua endpoint laporan butuh auth
router.use(authMiddleware);

// Helper — ambil tanggal awal & akhir hari ini
function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Helper — ambil 7 hari terakhir
function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      label: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }),
      start: new Date(d.setHours(0, 0, 0, 0)),
      end:   new Date(d.setHours(23, 59, 59, 999)),
    });
  }
  return days;
}

// Helper — ambil 30 hari terakhir
function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      label: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
      start: new Date(new Date(d).setHours(0, 0, 0, 0)),
      end:   new Date(new Date(d).setHours(23, 59, 59, 999)),
    });
  }
  return days;
}

// GET /api/reports/summary — ringkasan hari ini
router.get('/summary', async (req, res) => {
  try {
    const { start, end } = getTodayRange();

    const [totalOrders, doneOrders, cancelledOrders, revenue, totalItems] = await Promise.all([
      // Total order hari ini
      prisma.order.count({ where: { createdAt: { gte: start, lte: end } } }),
      // Order selesai
      prisma.order.count({ where: { status: 'done', createdAt: { gte: start, lte: end } } }),
      // Order dibatalkan
      prisma.order.count({ where: { status: 'cancelled', createdAt: { gte: start, lte: end } } }),
      // Total pendapatan (order done)
      prisma.order.aggregate({
        where: { status: 'done', createdAt: { gte: start, lte: end } },
        _sum: { totalAmount: true },
      }),
      // Total item terjual
      prisma.orderItem.aggregate({
        where: { order: { status: 'done', createdAt: { gte: start, lte: end } } },
        _sum: { quantity: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        doneOrders,
        cancelledOrders,
        pendingOrders: totalOrders - doneOrders - cancelledOrders,
        revenue: revenue._sum.totalAmount || 0,
        totalItems: totalItems._sum.quantity || 0,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal mengambil data ringkasan' });
  }
});

// GET /api/reports/chart?range=7 atau ?range=30
router.get('/chart', async (req, res) => {
  try {
    const range = req.query.range === '30' ? 30 : 7;
    const days = range === 7 ? getLast7Days() : getLast30Days();

    // Query semua order done dalam rentang waktu sekaligus
    const startDate = days[0].start;
    const endDate   = days[days.length - 1].end;

    const orders = await prisma.order.findMany({
      where: { status: 'done', createdAt: { gte: startDate, lte: endDate } },
      select: { totalAmount: true, createdAt: true },
    });

    // Kelompokkan per hari
    const chartData = days.map((day) => {
      const dayOrders = orders.filter(
        (o) => o.createdAt >= day.start && o.createdAt <= day.end
      );
      return {
        label: day.label,
        revenue: dayOrders.reduce((sum, o) => sum + o.totalAmount, 0),
        orders:  dayOrders.length,
      };
    });

    res.json({ success: true, data: chartData });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data grafik' });
  }
});

// GET /api/reports/top-menu?limit=5
router.get('/top-menu', async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit) || 5;
    const { start, end } = getTodayRange();

    // Pakai raw groupBy karena Prisma tidak support groupBy langsung dengan sum
    const topMenu = await prisma.orderItem.groupBy({
      by: ['menuId'],
      where: { order: { status: 'done', createdAt: { gte: start, lte: end } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    // Ambil nama menu
    const menuIds = topMenu.map((m) => m.menuId);
    const menus   = await prisma.menu.findMany({ where: { id: { in: menuIds } } });
    const menuMap = Object.fromEntries(menus.map((m) => [m.id, m]));

    const result = topMenu.map((item) => ({
      menuId:   item.menuId,
      name:     menuMap[item.menuId]?.name || 'Unknown',
      category: menuMap[item.menuId]?.category || '-',
      quantity: item._sum.quantity || 0,
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data menu terlaris' });
  }
});

// GET /api/reports/hourly — distribusi order per jam hari ini
router.get('/hourly', async (req, res) => {
  try {
    const { start, end } = getTodayRange();

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true, totalAmount: true, status: true },
    });

    // Kelompokkan per jam (0-23)
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour:    `${String(h).padStart(2, '0')}:00`,
      orders:  0,
      revenue: 0,
    }));

    orders.forEach((o) => {
      const h = new Date(o.createdAt).getHours();
      hourly[h].orders++;
      if (o.status === 'done') hourly[h].revenue += o.totalAmount;
    });

    // Hanya kirim jam yang ada aktivitas + jam sekitar jam operasional (07-22)
    const activeHours = hourly.filter((h, i) => i >= 7 && i <= 22);

    res.json({ success: true, data: activeHours });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data per jam' });
  }
});

module.exports = router;
