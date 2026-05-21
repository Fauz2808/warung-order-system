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
const reportRoutes = require('./src/routes/reports');

const app = express();
const server = http.createServer(app); // Bungkus express dengan http server (wajib untuk Socket.IO)

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    methods: ['GET', 'POST'],
  },
});

// ─── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3001' }));
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
app.use('/api/reports', reportRoutes);

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
