// src/routes/users.js
// Kelola akun kasir — owner only

const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');
const ownerMiddleware = require('../middleware/owner');

const router = express.Router();

// Semua route di sini butuh auth + owner
router.use(authMiddleware, ownerMiddleware);

// GET /api/users — list semua user (owner + kasir)
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data user' });
  }
});

// POST /api/users — tambah akun kasir baru
router.post('/', async (req, res) => {
  const { username, password, name } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
  }
  if (password.length < 4) {
    return res.status(400).json({ success: false, message: 'Password minimal 4 karakter' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Username sudah dipakai' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashed, name: name || null, role: 'kasir', isActive: true },
      select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
    });

    res.status(201).json({ success: true, data: user, message: 'Akun kasir berhasil dibuat' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal membuat akun' });
  }
});

// PUT /api/users/:id — edit nama, password, atau status aktif kasir
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, password, isActive } = req.body;

  // Jangan izinkan owner edit akun owner lain atau diri sendiri via route ini
  // (ganti password owner lewat /api/auth/change-password)
  try {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    if (target.role === 'owner') {
      return res.status(403).json({ success: false, message: 'Akun owner tidak bisa diedit di sini' });
    }

    const data = {};
    if (name !== undefined) data.name = name || null;
    if (isActive !== undefined) data.isActive = isActive;
    if (password) {
      if (password.length < 4) {
        return res.status(400).json({ success: false, message: 'Password minimal 4 karakter' });
      }
      data.password = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
    });

    res.json({ success: true, data: updated, message: 'Akun berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal memperbarui akun' });
  }
});

// DELETE /api/users/:id — hapus akun kasir
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    if (target.role === 'owner') {
      return res.status(403).json({ success: false, message: 'Akun owner tidak bisa dihapus' });
    }

    await prisma.user.delete({ where: { id } });
    res.json({ success: true, message: 'Akun kasir berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menghapus akun' });
  }
});

module.exports = router;
