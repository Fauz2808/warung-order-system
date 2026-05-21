// src/prisma.js
// Satu instance PrismaClient dipakai di seluruh aplikasi
// Jangan buat PrismaClient baru di setiap file!

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
