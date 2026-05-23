// src/prisma.js
// Satu instance PrismaClient dipakai di seluruh aplikasi
// Jangan buat PrismaClient baru di setiap file!

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Warm up koneksi saat server start — Railway free tier perlu ini
// agar request pertama tidak timeout
prisma.$connect()
  .then(() => console.log('✅ Database connected'))
  .catch((e) => console.error('⚠️  DB connect error (will retry):', e.message?.split('\n')[0]));

module.exports = prisma;
