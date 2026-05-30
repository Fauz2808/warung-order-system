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
