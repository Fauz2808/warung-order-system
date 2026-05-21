// src/middleware/auth.js
// Cek token JWT di setiap request ke endpoint yang butuh auth

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'warung-secret-ganti-ini-nanti';

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  // Format header: "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Akses ditolak. Silakan login terlebih dahulu.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // simpan data user ke request
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid atau sudah kadaluarsa. Silakan login ulang.' });
  }
}

module.exports = authMiddleware;
