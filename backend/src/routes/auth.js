// src/routes/auth.js
// Login & cek token kasir

const express = require('express');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'warung-secret-ganti-ini-nanti';
const JWT_EXPIRES = '12h'; // token berlaku 12 jam

// Akun kasir disimpan di .env (simple, tidak perlu tabel User dulu)
// Format: KASIR_USERNAME=kasir, KASIR_PASSWORD=1234
const KASIR_USERNAME = process.env.KASIR_USERNAME || 'kasir';
const KASIR_PASSWORD = process.env.KASIR_PASSWORD || '1234';

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
  }

  if (username !== KASIR_USERNAME || password !== KASIR_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Username atau password salah' });
  }

  const token = jwt.sign(
    { username, role: 'kasir' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.json({
    success: true,
    message: 'Login berhasil!',
    data: { token, username, role: 'kasir', expiresIn: JWT_EXPIRES },
  });
});

// GET /api/auth/me — cek apakah token masih valid
router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, data: req.user });
});

module.exports = router;
