// index.js — Server utama Warung Order System

require('dotenv/config');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// Import routes
const menuRoutes = require('./src/routes/menu');
const tableRoutes = require('./src/routes/tables');
const orderRoutes = require('./src/routes/orders');
const authRoutes = require('./src/routes/auth');
const reportRoutes     = require('./src/routes/reports');
const settingsRoutes   = require('./src/routes/settings');
const categoryRoutes   = require('./src/routes/categories');
const userRoutes       = require('./src/routes/users');
const modifierRoutes   = require('./src/routes/modifiers');
const sessionRoutes    = require('./src/routes/sessions');

const app = express();
const server = http.createServer(app); // Bungkus express dengan http server (wajib untuk Socket.IO)

// CORS — terima Vercel + localhost
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:3001',
  'http://localhost:3000',
].filter(Boolean).map(o => o.replace(/\/$/, '')); // hapus trailing slash

const corsOptions = {
  origin: (origin, callback) => {
    // Izinkan kalau tidak ada origin (curl/postman) atau match allowed list atau *.vercel.app
    if (!origin || ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin) || /carracoffee\.my\.id$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} tidak diizinkan`));
    }
  },
  credentials: true,
};

// Setup Socket.IO
const io = new Server(server, {
  cors: { origin: corsOptions.origin, methods: ['GET', 'POST'] },
});

// ─── Middleware ────────────────────────────────────────────────
app.use(cors(corsOptions));
app.use(express.json()); // Biar bisa baca req.body dalam format JSON

// Injeksi io ke semua request, biar routes bisa emit Socket.IO events
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ─── Routes ────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports',     reportRoutes);
app.use('/api/settings',    settingsRoutes);
app.use('/api/categories',  categoryRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/modifiers',   modifierRoutes);
app.use('/api/sessions',    sessionRoutes);

// Health check — buat cek server jalan
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server berjalan!', timestamp: new Date() });
});

// ─── Socket.IO Events ──────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Client terhubung: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`❌ Client terputus: ${socket.id}`);
  });
});

// ─── Auto open/close cron — cek setiap menit ───────────────────
const prisma = require('./src/prisma');

let lastOpenState = null;

function checkIsOpenNow(openTime, closeTime, isForceClose) {
  if (isForceClose) return false;
  const now = new Date();
  const wibMin = ((now.getUTCHours() * 60 + now.getUTCMinutes()) + 7 * 60) % (24 * 60);
  const [oh, om] = openTime.split(':').map(Number);
  const [ch, cm] = closeTime.split(':').map(Number);
  const oMin = oh * 60 + om, cMin = ch * 60 + cm;
  return oMin <= cMin ? wibMin >= oMin && wibMin < cMin : wibMin >= oMin || wibMin < cMin;
}

setInterval(async () => {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    if (!s) return;
    const isOpen = checkIsOpenNow(s.openTime, s.closeTime, s.isForceClose);
    if (lastOpenState !== null && lastOpenState !== isOpen) {
      io.emit('warung:status_changed', { isOpen });
      console.log(`🕐 Warung otomatis ${isOpen ? 'BUKA' : 'TUTUP'}`);
    }
    lastOpenState = isOpen;
  } catch (_) {}
}, 60000);

// ─── Auto-close bon nyangkut (open tab lupa ditutup) ───────────
// Bon yang terbuka > 8 jam kemungkinan besar terlupakan. Tutup otomatis agar
// meja tidak stuck & customer berikutnya tidak menempel ke bon lama.
// Order TIDAK ditandai lunas (isPaid tetap false) — bukan omzet.
const STALE_BON_HOURS = 8;
setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - STALE_BON_HOURS * 60 * 60 * 1000);
    const stale = await prisma.tableSession.findMany({
      where: { status: 'open', openedAt: { lt: cutoff } },
    });
    for (const s of stale) {
      await prisma.$transaction([
        prisma.tableSession.update({
          where: { id: s.id },
          data: { status: 'closed', closedAt: new Date(), callRequestedAt: null },
        }),
        prisma.table.update({ where: { id: s.tableId }, data: { isOccupied: false } }),
      ]);
      io.emit('session:closed', { sessionId: s.id, tableId: s.tableId });
    }
    if (stale.length) console.log(`🧹 Auto-close ${stale.length} bon nyangkut (>${STALE_BON_HOURS} jam)`);
  } catch (_) {}
}, 5 * 60 * 1000);

// ─── Self-ping setiap 5 menit agar Railway tidak sleep ─────────
setInterval(() => {
  const url = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
  require('http').get(`${url}/api/health`, () => {}).on('error', () => {});
}, 5 * 60 * 1000);

// ─── Backfill paymentMethod dari notes (sekali jalan) ──────────
(async () => {
  try {
    const updated = await prisma.order.updateMany({
      where: { paymentMethod: 'cash', notes: { contains: '[Bayar QRIS]' } },
      data: { paymentMethod: 'qris' },
    });
    if (updated.count > 0) {
      console.log(`✅ Backfill: ${updated.count} order diupdate ke paymentMethod=qris`);
    }
  } catch (_) {}
})();

// ─── Backfill isPaid: order 'done' TANPA bon (sessionId null) dianggap lunas ──
// Laporan omzet kini berbasis isPaid. Order lama yang sudah 'done' (alur lama,
// tanpa open tab) ditandai lunas agar riwayat omzet tetap utuh. Order open-tab
// (punya sessionId) TIDAK disentuh — lunas hanya saat kasir menutup bon.
(async () => {
  try {
    const updated = await prisma.order.updateMany({
      where: { status: 'done', isPaid: false, sessionId: null },
      data: { isPaid: true },
    });
    if (updated.count > 0) {
      console.log(`✅ Backfill: ${updated.count} order 'done' lama ditandai lunas (isPaid)`);
    }
  } catch (_) {}
})();

// ─── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   🍜 Warung Order System — Backend   ║
  ║   Server jalan di port ${PORT}           ║
  ║   http://localhost:${PORT}/api/health   ║
  ╚══════════════════════════════════════╝
  `);
});
