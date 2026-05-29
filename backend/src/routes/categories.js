// src/routes/categories.js
// CRUD kategori menu — bisa dikelola kasir/admin

const express = require('express');
const { z }   = require('zod');
const prisma  = require('../prisma');
const authMiddleware  = require('../middleware/auth');

const router = express.Router();

// Slug auto-generate dari label: "Teh Susu" → "teh-susu"
const toSlug = (str) =>
  str.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const categorySchema = z.object({
  label: z.string().min(1, 'Nama kategori wajib diisi').max(50),
  emoji: z.string().default('☕'),
  sortOrder: z.number().int().default(0),
});

// ─── GET /api/categories — semua kategori (public, no auth) ──
router.get('/', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    res.json({ success: true, data: categories });
  } catch {
    res.status(500).json({ success: false, message: 'Gagal mengambil kategori' });
  }
});

// ─── POST /api/categories — tambah kategori baru (auth) ──────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data tidak valid',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const { label, emoji, sortOrder } = parsed.data;
    const slug = toSlug(label);

    if (!slug) {
      return res.status(400).json({ success: false, message: 'Nama kategori tidak valid' });
    }

    const category = await prisma.category.create({
      data: { slug, label, emoji, sortOrder },
    });
    res.status(201).json({ success: true, data: category, message: 'Kategori berhasil ditambahkan' });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Kategori dengan nama itu sudah ada' });
    }
    res.status(500).json({ success: false, message: 'Gagal menambahkan kategori' });
  }
});

// ─── PUT /api/categories/:id — edit label/emoji/sortOrder ────
//     Slug TIDAK bisa diubah (karena sudah dipakai di Menu.category)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data tidak valid',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const { label, emoji, sortOrder } = parsed.data;
    const category = await prisma.category.update({
      where: { id },
      data: { label, emoji, sortOrder },
    });
    res.json({ success: true, data: category, message: 'Kategori berhasil diperbarui' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    }
    res.status(500).json({ success: false, message: 'Gagal memperbarui kategori' });
  }
});

// ─── DELETE /api/categories/:id — hapus kategori ─────────────
//     Tolak jika masih ada menu yang menggunakan slug ini
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    }

    // Cek apakah ada menu yang memakai kategori ini
    const menuCount = await prisma.menu.count({ where: { category: category.slug } });
    if (menuCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak bisa dihapus — ada ${menuCount} menu yang masih pakai kategori ini. Pindahkan menu dulu.`,
      });
    }

    await prisma.category.delete({ where: { id } });
    res.json({ success: true, message: 'Kategori berhasil dihapus' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    }
    res.status(500).json({ success: false, message: 'Gagal menghapus kategori' });
  }
});

module.exports = router;
