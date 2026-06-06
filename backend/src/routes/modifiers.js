// src/routes/modifiers.js
// CRUD modifier groups & options + assign ke menu

const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const requireAuth = require('../middleware/auth');

const router = Router();
const prisma = new PrismaClient();

// ─── Schema validasi ──────────────────────────────────

const groupSchema = z.object({
  name:        z.string().min(1).max(100),
  required:    z.boolean().default(false),
  multiSelect: z.boolean().default(false),
  minSelect:   z.number().int().min(0).default(0),
  maxSelect:   z.number().int().min(1).nullable().default(null),
  sortOrder:   z.number().int().default(0),
});

const optionSchema = z.object({
  name:        z.string().min(1).max(100),
  priceAdd:    z.number().int().min(0).default(0),
  isDefault:   z.boolean().default(false),
  isAvailable: z.boolean().default(true),
  sortOrder:   z.number().int().default(0),
});

// ─── Modifier Groups ──────────────────────────────────

// GET /api/modifiers — list semua grup beserta options
router.get('/', async (req, res) => {
  try {
    const groups = await prisma.modifierGroup.findMany({
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        menuLinks: { include: { menu: { select: { id: true, name: true } } } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ success: true, data: groups });
  } catch {
    res.status(500).json({ success: false, message: 'Gagal mengambil data modifier' });
  }
});

// POST /api/modifiers — buat modifier group baru
router.post('/', requireAuth, async (req, res) => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Data tidak valid', errors: parsed.error.flatten() });

  try {
    const group = await prisma.modifierGroup.create({ data: parsed.data, include: { options: true } });
    res.status(201).json({ success: true, data: group });
  } catch {
    res.status(500).json({ success: false, message: 'Gagal membuat modifier group' });
  }
});

// PUT /api/modifiers/:id — update modifier group
router.put('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = groupSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Data tidak valid' });

  try {
    const group = await prisma.modifierGroup.update({
      where: { id },
      data: parsed.data,
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json({ success: true, data: group });
  } catch {
    res.status(404).json({ success: false, message: 'Modifier group tidak ditemukan' });
  }
});

// DELETE /api/modifiers/:id — hapus modifier group (cascade ke options & menu links)
router.delete('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.modifierGroup.delete({ where: { id } });
    res.json({ success: true, message: 'Modifier group dihapus' });
  } catch {
    res.status(404).json({ success: false, message: 'Modifier group tidak ditemukan' });
  }
});

// ─── Modifier Options ─────────────────────────────────

// POST /api/modifiers/:groupId/options — tambah opsi ke grup
router.post('/:groupId/options', requireAuth, async (req, res) => {
  const groupId = parseInt(req.params.groupId);
  const parsed = optionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Data tidak valid' });

  try {
    const option = await prisma.modifierOption.create({ data: { ...parsed.data, groupId } });
    res.status(201).json({ success: true, data: option });
  } catch {
    res.status(500).json({ success: false, message: 'Gagal menambah opsi' });
  }
});

// PUT /api/modifiers/options/:id — update opsi
router.put('/options/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = optionSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Data tidak valid' });

  try {
    const option = await prisma.modifierOption.update({ where: { id }, data: parsed.data });
    res.json({ success: true, data: option });
  } catch {
    res.status(404).json({ success: false, message: 'Opsi tidak ditemukan' });
  }
});

// DELETE /api/modifiers/options/:id — hapus opsi
router.delete('/options/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.modifierOption.delete({ where: { id } });
    res.json({ success: true, message: 'Opsi dihapus' });
  } catch {
    res.status(404).json({ success: false, message: 'Opsi tidak ditemukan' });
  }
});

// ─── Assign modifier groups ke menu ──────────────────

// PUT /api/modifiers/menu/:menuId — set modifier groups untuk menu (replace all)
router.put('/menu/:menuId', requireAuth, async (req, res) => {
  const menuId = parseInt(req.params.menuId);
  const { groupIds } = req.body; // array of groupId

  if (!Array.isArray(groupIds)) {
    return res.status(400).json({ success: false, message: 'groupIds harus array' });
  }

  try {
    // Replace semua link modifier group untuk menu ini
    await prisma.menuModifierGroup.deleteMany({ where: { menuId } });

    if (groupIds.length > 0) {
      await prisma.menuModifierGroup.createMany({
        data: groupIds.map((groupId, i) => ({ menuId, groupId, sortOrder: i })),
      });
    }

    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      include: {
        modifierGroups: {
          include: { group: { include: { options: { orderBy: { sortOrder: 'asc' } } } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    res.json({ success: true, data: menu });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Gagal update modifier groups menu' });
  }
});

module.exports = router;
