// src/middleware/owner.js
// Hanya owner yang boleh akses endpoint ini

function ownerMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak. Hanya owner yang bisa melakukan ini.',
    });
  }
  next();
}

module.exports = ownerMiddleware;
