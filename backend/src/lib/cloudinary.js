// src/lib/cloudinary.js
// Setup Cloudinary + multer untuk upload foto menu

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Konfigurasi Cloudinary pakai credentials dari .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage — foto disimpan di folder "warung-menu" di Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'warung-menu',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 600, height: 600, crop: 'fill', gravity: 'auto' }, // crop jadi square 600x600
      { quality: 'auto', fetch_format: 'auto' },                  // auto compress & format
    ],
  },
});

// Validasi ukuran file max 5MB
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format file tidak didukung. Gunakan JPG, PNG, atau WebP.'));
    }
  },
});

module.exports = { cloudinary, upload };
