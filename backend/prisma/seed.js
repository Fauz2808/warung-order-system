// prisma/seed.js
// Data awal untuk database — menu & meja

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Mulai seeding database...\n');

  // ─── Hapus data lama (biar bisa di-reset) ─────────────
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.table.deleteMany();
  console.log('🗑️  Data lama dihapus\n');

  // ─── Seed Menu ─────────────────────────────────────────
  const menuData = [
    // Makanan
    { name: 'Nasi Goreng Spesial',    price: 25000, category: 'makanan', description: 'Nasi goreng dengan telur ceplok, ayam suwir, dan kerupuk' },
    { name: 'Nasi Goreng Seafood',    price: 30000, category: 'makanan', description: 'Nasi goreng dengan udang, cumi, dan bakso ikan' },
    { name: 'Mie Goreng Spesial',     price: 22000, category: 'makanan', description: 'Mie goreng dengan telur, ayam, dan sayuran' },
    { name: 'Mie Ayam Bakso',         price: 20000, category: 'makanan', description: 'Mie ayam kuah dengan bakso sapi dan pangsit' },
    { name: 'Ayam Geprek',            price: 22000, category: 'makanan', description: 'Ayam goreng crispy, geprek, sambal bawang' },
    { name: 'Ayam Bakar',             price: 28000, category: 'makanan', description: 'Ayam bakar bumbu kecap dengan lalapan dan sambal' },
    { name: 'Nasi Putih',             price: 5000,  category: 'makanan', description: 'Nasi putih pulen' },
    { name: 'Nasi Uduk',              price: 8000,  category: 'makanan', description: 'Nasi uduk gurih dengan bawang goreng' },
    { name: 'Gado-Gado',              price: 18000, category: 'makanan', description: 'Sayuran rebus dengan bumbu kacang dan lontong' },
    { name: 'Soto Ayam',              price: 20000, category: 'makanan', description: 'Soto ayam kuah bening dengan nasi atau lontong' },

    // Minuman
    { name: 'Es Teh Manis',           price: 5000,  category: 'minuman', description: 'Teh manis dingin segar' },
    { name: 'Teh Hangat',             price: 4000,  category: 'minuman', description: 'Teh hangat manis' },
    { name: 'Es Jeruk',               price: 8000,  category: 'minuman', description: 'Jeruk peras segar dengan es' },
    { name: 'Jus Alpukat',            price: 15000, category: 'minuman', description: 'Jus alpukat krim dengan susu kental manis' },
    { name: 'Jus Mangga',             price: 13000, category: 'minuman', description: 'Jus mangga segar tanpa tambahan air' },
    { name: 'Es Kelapa Muda',         price: 12000, category: 'minuman', description: 'Kelapa muda segar dengan es batu' },
    { name: 'Kopi Hitam',             price: 6000,  category: 'minuman', description: 'Kopi hitam tubruk' },
    { name: 'Kopi Susu',              price: 10000, category: 'minuman', description: 'Kopi hitam dengan susu evaporasi' },
    { name: 'Air Mineral',            price: 3000,  category: 'minuman', description: 'Air mineral botol 600ml' },
    { name: 'Es Campur',              price: 12000, category: 'minuman', description: 'Es campur dengan buah, cincau, dan santan' },
  ];

  const createdMenu = await prisma.menu.createMany({ data: menuData });
  console.log(`✅ ${createdMenu.count} menu berhasil dibuat`);

  // ─── Seed Meja ─────────────────────────────────────────
  const tableData = [
    // Lantai 1
    { number: 1,  floor: 1 },
    { number: 2,  floor: 1 },
    { number: 3,  floor: 1 },
    { number: 4,  floor: 1 },
    { number: 5,  floor: 1 },
    { number: 6,  floor: 1 },
    // Lantai 2
    { number: 7,  floor: 2 },
    { number: 8,  floor: 2 },
    { number: 9,  floor: 2 },
    { number: 10, floor: 2 },
    { number: 11, floor: 2 },
    { number: 12, floor: 2 },
  ];

  const createdTables = await prisma.table.createMany({ data: tableData });
  console.log(`✅ ${createdTables.count} meja berhasil dibuat`);

  // ─── Summary ───────────────────────────────────────────
  const totalMenu   = await prisma.menu.count();
  const totalTables = await prisma.table.count();
  const makanan     = await prisma.menu.count({ where: { category: 'makanan' } });
  const minuman     = await prisma.menu.count({ where: { category: 'minuman' } });
  const lantai1     = await prisma.table.count({ where: { floor: 1 } });
  const lantai2     = await prisma.table.count({ where: { floor: 2 } });

  console.log(`
╔══════════════════════════════╗
║      Seed Berhasil! 🎉       ║
╠══════════════════════════════╣
║ Menu    : ${String(totalMenu).padEnd(3)} (${makanan} makanan, ${minuman} minuman)  ║
║ Meja    : ${String(totalTables).padEnd(3)} (Lt1: ${lantai1}, Lt2: ${lantai2})      ║
╚══════════════════════════════╝
  `);
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
