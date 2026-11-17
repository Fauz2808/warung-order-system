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

// Free-hosting health checks must not wake an idle Neon database.
if (process.env.PAUSE_IDLE_JOBS !== 'true') {
  prisma.$connect()
    .then(() => console.log('✅ Database connected'))
    .catch((e) => console.error('⚠️  DB connect error (will retry):', e.message?.split('\n')[0]));
}

module.exports = prisma;
