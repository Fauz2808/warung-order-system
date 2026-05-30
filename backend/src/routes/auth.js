// src/routes/auth.js
// Login dari database — support role owner & kasir

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'warung-secret-ganti-ini-nanti';
const JWT_EXPIRES = '365d';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Akun ini dinonaktifkan. Hubungi owner.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      success: true,
      message: 'Login berhasil!',
      data: { token, username: user.username, role: user.role, name: user.name, expiresIn: JWT_EXPIRES },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, data: req.user });
});

// PUT /api/auth/change-password — ganti password sendiri (semua role)
router.put('/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Password lama dan baru wajib diisi' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ success: false, message: 'Password baru minimal 4 karakter' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Password lama tidak sesuai' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });

    res.json({ success: true, message: 'Password berhasil diganti' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal mengganti password' });
  }
});

module.exports = router;
