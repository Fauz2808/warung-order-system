// src/routes/menu.js
// Endpoint untuk kelola menu (makanan & minuman)

const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const { upload, cloudinary } = require('../lib/cloudinary');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Validasi data menu pakai Zod
const menuSchema = z.object({
  name: z.string().min(1, 'Nama menu wajib diisi'),
  description: z.string().optional(),
  price: z.number().int().positive('Harga harus lebih dari 0'),
  category: z.string().min(1, 'Kategori wajib diisi'),
  imageUrl: z.string().url().optional().or(z.literal('')),
  isAvailable: z.boolean().optional().default(true),
  stock: z.number().int().min(0).nullable().optional(), // null = unlimited
  hasTemperatureOption: z.boolean().optional().default(false),
  hasAdditionalEspresso: z.boolean().optional().default(false),
  additionalEspressoPrice: z.number().int().min(0).optional().default(3000),
});

// GET /api/menu — ambil semua menu yang tersedia
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;

    const menu = await prisma.menu.findMany({
      where: {
        ...(category ? { category } : {}),
      },
      include: {
        modifierGroups: {
          include: { group: { include: { options: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } } } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    res.json({ success: true, data: menu });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data menu' });
  }
});

// GET /api/menu/:id — detail satu menu
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const menu = await prisma.menu.findUnique({
      where: { id },
      include: {
        modifierGroups: {
          include: { group: { include: { options: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } } } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
    }

    res.json({ success: true, data: menu });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data menu' });
  }
});

// POST /api/menu — tambah menu baru (kasir/admin)
router.post('/', async (req, res) => {
  try {
    const parsed = menuSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data tidak valid',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const menu = await prisma.menu.create({ data: parsed.data });
    res.status(201).json({ success: true, data: menu, message: 'Menu berhasil ditambahkan' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal menambahkan menu' });
  }
});

// PUT /api/menu/:id — edit menu (kasir/admin)
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Validasi partial (tidak semua field wajib diisi saat update)
    const parsed = menuSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data tidak valid',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const menu = await prisma.menu.update({
      where: { id },
      data: parsed.data,
    });

    res.json({ success: true, data: menu, message: 'Menu berhasil diperbarui' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
    }
    res.status(500).json({ success: false, message: 'Gagal memperbarui menu' });
  }
});

// DELETE /api/menu/:id — hapus menu (kasir/admin)
// menuId di OrderItem nullable — riwayat order tetap ada via snapshot menuName
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Set menuId = null pada order items lama sebelum hapus menu
    await prisma.orderItem.updateMany({
      where: { menuId: id },
      data: { menuId: null },
    });

    await prisma.menu.delete({ where: { id } });
    res.json({ success: true, message: 'Menu berhasil dihapus' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
    }
    res.status(500).json({ success: false, message: 'Gagal menghapus menu' });
  }
});

// PATCH /api/menu/:id/stock — tambah atau kurangi stok (butuh auth)
// Body: { delta: +5 | -3 } atau { stock: 10 } untuk set langsung
router.patch('/:id/stock', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { delta, stock: newStock } = req.body;

    const menu = await prisma.menu.findUnique({ where: { id } });
    if (!menu) return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });

    let updatedStock;

    if (typeof newStock === 'number') {
      // Set langsung ke nilai tertentu
      updatedStock = Math.max(0, newStock);
    } else if (typeof delta === 'number') {
      // Tambah/kurang dari nilai saat ini
      const current = menu.stock ?? 0;
      updatedStock = Math.max(0, current + delta);
    } else {
      return res.status(400).json({ success: false, message: 'Sertakan delta atau stock' });
    }

    // Auto-toggle isAvailable berdasarkan stok
    const isAvailable = updatedStock > 0 ? menu.isAvailable : false;

    const updated = await prisma.menu.update({
      where: { id },
      data: {
        stock: updatedStock,
        isAvailable,
      },
    });

    res.json({ success: true, data: updated, message: `Stok diperbarui: ${updatedStock}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal memperbarui stok' });
  }
});

// POST /api/menu/:id/upload — upload/ganti foto menu (butuh auth)
router.post(
  '/:id/upload',
  authMiddleware,
  (req, res, next) => {
    // Cek apakah Cloudinary sudah dikonfigurasi
    if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME === 'isi-cloud-name-kamu') {
      return res.status(503).json({
        success: false,
        message: 'Cloudinary belum dikonfigurasi. Isi CLOUDINARY_CLOUD_NAME, API_KEY, dan API_SECRET di file .env',
      });
    }
    next();
  },
  upload.single('image'), // 'image' = nama field di form-data
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'File gambar wajib diupload' });
      }

      // Ambil menu lama untuk hapus foto lama dari Cloudinary
      const existing = await prisma.menu.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
      }

      // Hapus foto lama dari Cloudinary jika ada
      if (existing.imageUrl) {
        try {
          // Ambil public_id dari URL Cloudinary
          const parts = existing.imageUrl.split('/');
          const filename = parts[parts.length - 1].split('.')[0];
          const folder = parts[parts.length - 2];
          await cloudinary.uploader.destroy(`${folder}/${filename}`);
        } catch (e) {
          // Tidak masalah kalau hapus foto lama gagal
          console.warn('Gagal hapus foto lama:', e.message);
        }
      }

      // Simpan URL foto baru ke database
      const menu = await prisma.menu.update({
        where: { id },
        data: { imageUrl: req.file.path }, // multer-storage-cloudinary simpan URL di req.file.path
      });

      res.json({
        success: true,
        data: { imageUrl: menu.imageUrl },
        message: 'Foto menu berhasil diupload!',
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Gagal upload foto' });
    }
  }
);

// DELETE /api/menu/:id/image — hapus foto menu (butuh auth)
router.delete('/:id/image', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const menu = await prisma.menu.findUnique({ where: { id } });

    if (!menu) return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
    if (!menu.imageUrl) return res.status(400).json({ success: false, message: 'Menu tidak punya foto' });

    // Hapus dari Cloudinary
    try {
      const parts = menu.imageUrl.split('/');
      const filename = parts[parts.length - 1].split('.')[0];
      const folder = parts[parts.length - 2];
      await cloudinary.uploader.destroy(`${folder}/${filename}`);
    } catch (e) {
      console.warn('Gagal hapus dari Cloudinary:', e.message);
    }

    // Set imageUrl jadi null di database
    await prisma.menu.update({ where: { id }, data: { imageUrl: null } });

    res.json({ success: true, message: 'Foto menu berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal menghapus foto' });
  }
});

module.exports = router;
