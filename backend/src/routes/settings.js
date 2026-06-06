// src/routes/settings.js
// Pengaturan warung: jam buka/tutup

const express = require('express');
const prisma = require('../prisma');
const authMiddleware  = require('../middleware/auth');

const router = express.Router();

// Helper — cek apakah warung sedang buka berdasarkan jam sekarang
function checkIsOpen(openTime, closeTime, isForceClose) {
  if (isForceClose) return false;

  const now = new Date();
  // Konversi ke WIB (UTC+7)
  const wibOffset = 7 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const wibMinutes = (utcMinutes + wibOffset) % (24 * 60);

  const [openH, openM]   = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  const openMinutes  = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  // Handle overnight (misal: buka 22:00 tutup 02:00)
  if (openMinutes <= closeMinutes) {
    return wibMinutes >= openMinutes && wibMinutes < closeMinutes;
  } else {
    return wibMinutes >= openMinutes || wibMinutes < closeMinutes;
  }
}

// Pastikan Settings row ada (upsert kalau belum ada)
async function getOrCreateSettings() {
  return prisma.settings.upsert({
    where:  { id: 1 },
    update: {},
    create: { id: 1, businessName: 'Warung Kita', businessTagline: 'Pesan mudah, nikmati santai', openTime: '08:00', closeTime: '22:00', isForceClose: false },
  });
}

// GET /api/settings — publik, dipakai customer page
router.get('/', async (req, res) => {
  try {
    const s = await getOrCreateSettings();
    const isOpen = checkIsOpen(s.openTime, s.closeTime, s.isForceClose);
    res.json({
      success: true,
      data: {
        businessName:    s.businessName,
        businessTagline: s.businessTagline,
        openTime:        s.openTime,
        closeTime:       s.closeTime,
        isForceClose:    s.isForceClose,
        isOpen,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal mengambil pengaturan' });
  }
});

// PUT /api/settings — semua staff bisa (kasir & owner)
router.put('/', authMiddleware, async (req, res) => {
  try {
    const { businessName, businessTagline, openTime, closeTime, isForceClose } = req.body;

    // Validasi format jam HH:mm
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (openTime  && !timeRegex.test(openTime))  return res.status(400).json({ success: false, message: 'Format jam buka tidak valid (HH:mm)' });
    if (closeTime && !timeRegex.test(closeTime)) return res.status(400).json({ success: false, message: 'Format jam tutup tidak valid (HH:mm)' });
    if (businessName !== undefined && (typeof businessName !== 'string' || businessName.trim().length < 1)) {
      return res.status(400).json({ success: false, message: 'Nama bisnis tidak boleh kosong' });
    }

    const updated = await prisma.settings.upsert({
      where:  { id: 1 },
      update: {
        ...(businessName    !== undefined ? { businessName: businessName.trim() }       : {}),
        ...(businessTagline !== undefined ? { businessTagline: businessTagline.trim() } : {}),
        ...(openTime        !== undefined ? { openTime }                                : {}),
        ...(closeTime       !== undefined ? { closeTime }                               : {}),
        ...(isForceClose    !== undefined ? { isForceClose }                            : {}),
      },
      create: {
        id: 1,
        businessName:    businessName    ?? 'Warung Kita',
        businessTagline: businessTagline ?? 'Pesan mudah, nikmati santai',
        openTime:        openTime        ?? '08:00',
        closeTime:       closeTime       ?? '22:00',
        isForceClose:    isForceClose    ?? false,
      },
    });

    const isOpen = checkIsOpen(updated.openTime, updated.closeTime, updated.isForceClose);
    res.json({ success: true, data: { businessName: updated.businessName, businessTagline: updated.businessTagline, openTime: updated.openTime, closeTime: updated.closeTime, isForceClose: updated.isForceClose, isOpen }, message: 'Pengaturan berhasil disimpan' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan' });
  }
});

module.exports = router;
