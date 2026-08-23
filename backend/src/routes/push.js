const express = require('express');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');
const { isConfigured, publicKey } = require('../lib/pushNotifications');

const router = express.Router();

router.get('/public-key', authMiddleware, (req, res) => {
  if (!isConfigured) {
    return res.status(503).json({ success: false, message: 'Push notification belum dikonfigurasi' });
  }
  res.json({ success: true, data: { publicKey } });
});

router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ success: false, message: 'Subscription tidak valid' });
    }

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.user.id },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: req.user.id },
    });

    res.status(201).json({ success: true, data: { id: subscription.id } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal menyimpan langganan notifikasi' });
  }
});

router.delete('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ success: false, message: 'Endpoint wajib diisi' });

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.user.id },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal menonaktifkan notifikasi' });
  }
});

module.exports = router;
