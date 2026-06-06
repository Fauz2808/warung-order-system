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

    const doneWhere = { status: 'done', createdAt: { gte: start, lte: end } };

    const [totalOrders, doneOrders, cancelledOrders, revenue, totalItems, cashRevenue, qrisRevenue, splitRevenue, cashOrders, qrisOrders, splitOrders] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.order.count({ where: doneWhere }),
      prisma.order.count({ where: { status: 'cancelled', createdAt: { gte: start, lte: end } } }),
      prisma.order.aggregate({ where: doneWhere, _sum: { totalAmount: true } }),
      prisma.orderItem.aggregate({ where: { order: doneWhere }, _sum: { quantity: true } }),
      // Breakdown Cash
      prisma.order.aggregate({ where: { ...doneWhere, paymentMethod: 'cash' }, _sum: { totalAmount: true } }),
      // Breakdown QRIS
      prisma.order.aggregate({ where: { ...doneWhere, paymentMethod: 'qris' }, _sum: { totalAmount: true } }),
      // Breakdown Split
      prisma.order.aggregate({ where: { ...doneWhere, paymentMethod: 'split' }, _sum: { totalAmount: true } }),
      prisma.order.count({ where: { ...doneWhere, paymentMethod: 'cash' } }),
      prisma.order.count({ where: { ...doneWhere, paymentMethod: 'qris' } }),
      prisma.order.count({ where: { ...doneWhere, paymentMethod: 'split' } }),
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
        cashRevenue: cashRevenue._sum.totalAmount || 0,
        qrisRevenue: qrisRevenue._sum.totalAmount || 0,
        splitRevenue: splitRevenue._sum.totalAmount || 0,
        cashOrders,
        qrisOrders,
        splitOrders,
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
    const activeHours = hourly.filter((_, i) => i >= 7 && i <= 22);

    res.json({ success: true, data: activeHours });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data per jam' });
  }
});

// GET /api/reports/export?start=YYYY-MM-DD&end=YYYY-MM-DD&format=csv
// Export data order sebagai CSV (bisa dibuka di Excel)
router.get('/export', async (req, res) => {
  try {
    const { start, end } = req.query;

    // Default: hari ini
    const today = new Date();
    const startDate = start
      ? new Date(start + 'T00:00:00.000Z')
      : new Date(today.setHours(0, 0, 0, 0));
    const endDate = end
      ? new Date(end + 'T23:59:59.999Z')
      : new Date(new Date().setHours(23, 59, 59, 999));

    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { not: 'cancelled' },
      },
      include: {
        table: true,
        items: { include: { menu: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Format tanggal untuk nama file
    const dateLabel = start === end && start
      ? start
      : `${start || 'awal'}_sd_${end || 'sekarang'}`;

    // Buat baris CSV
    const rows = [];

    // Header baris 1 — info export
    rows.push(['LAPORAN PENJUALAN CARRA COFFEE']);
    rows.push([`Periode: ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} - ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`]);
    rows.push([`Diekspor: ${new Date().toLocaleString('id-ID')}`]);
    rows.push([]); // baris kosong

    // Header kolom
    rows.push([
      'No', 'Order ID', 'Tanggal', 'Jam', 'Meja', 'Lantai',
      'Tipe Order', 'Metode Bayar', 'Status', 'Menu (nama x qty)', 'Subtotal Item', 'Catatan Order', 'Total',
    ]);

    // Data order
    let no = 1;
    for (const order of orders) {
      // Satu baris per item — merge info order di baris pertama
      const payLabel = order.paymentMethod === 'qris' ? 'QRIS' : 'Cash';
      if (order.items.length === 0) {
        rows.push([
          no++,
          order.id,
          new Date(order.createdAt).toLocaleDateString('id-ID'),
          new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          order.table?.number || '-',
          order.table?.floor || '-',
          order.orderType === 'take-away' ? 'Take Away' : 'Dine In',
          payLabel,
          order.status,
          '-', '-',
          order.notes || '',
          order.totalAmount,
        ]);
      } else {
        order.items.forEach((item, idx) => {
          rows.push([
            idx === 0 ? no++ : '',
            idx === 0 ? order.id : '',
            idx === 0 ? new Date(order.createdAt).toLocaleDateString('id-ID') : '',
            idx === 0 ? new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '',
            idx === 0 ? (order.table?.number || '-') : '',
            idx === 0 ? (order.table?.floor  || '-') : '',
            idx === 0 ? (order.orderType === 'take-away' ? 'Take Away' : 'Dine In') : '',
            idx === 0 ? payLabel : '',
            idx === 0 ? order.status : '',
            `${item.menu?.name || 'Unknown'} x${item.quantity}${item.notes ? ` (${item.notes})` : ''}`,
            item.price * item.quantity,
            idx === 0 ? (order.notes || '') : '',
            idx === 0 ? order.totalAmount : '',
          ]);
        });
      }
    }

    // Baris kosong + summary
    rows.push([]);
    rows.push(['RINGKASAN']);
    rows.push(['Total Order', orders.length]);
    rows.push(['Total Pendapatan', orders.reduce((s, o) => s + o.totalAmount, 0)]);
    rows.push(['Pendapatan Cash', orders.filter((o) => o.paymentMethod !== 'qris').reduce((s, o) => s + o.totalAmount, 0)]);
    rows.push(['Pendapatan QRIS', orders.filter((o) => o.paymentMethod === 'qris').reduce((s, o) => s + o.totalAmount, 0)]);
    rows.push(['Order Dine In', orders.filter((o) => o.orderType !== 'take-away').length]);
    rows.push(['Order Take Away', orders.filter((o) => o.orderType === 'take-away').length]);

    // Konversi ke string CSV
    const csvContent = rows
      .map((row) =>
        row.map((cell) => {
          const str = String(cell ?? '');
          // Escape field yang mengandung koma, newline, atau tanda kutip
          if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      )
      .join('\n');

    // Tambah BOM agar Excel bisa baca karakter Indonesia dengan benar
    const bom = '﻿';
    const filename = `laporan_carra_${dateLabel}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(bom + csvContent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal mengekspor data' });
  }
});

module.exports = router;
