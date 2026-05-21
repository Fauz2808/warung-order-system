// prisma/seed.js
// Data menu Carra Coffee

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Mulai seeding database Carra Coffee...\n');

  // ─── Hapus data lama ──────────────────────────────────
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.table.deleteMany();
  console.log('🗑️  Data lama dihapus\n');

  // ─── Seed Menu Carra Coffee ───────────────────────────
  const menuData = [

    // ── Carra Signature ──────────────────────────────────
    { name: 'Kopi Susu Carra',   price: 18000, category: 'signature',  description: 'Signature kopi susu khas Carra Coffee',          isAvailable: true },
    { name: 'Carra Vol 1',       price: 23000, category: 'signature',  description: 'Signature blend Carra vol. 1',                   isAvailable: true },
    { name: 'Carra Vol 2',       price: 23000, category: 'signature',  description: 'Signature blend Carra vol. 2',                   isAvailable: true },
    { name: 'Mont Blanc',        price: 35000, category: 'signature',  description: 'Signature premium Mont Blanc',                   isAvailable: true },

    // ── Coffee ────────────────────────────────────────────
    { name: 'Ice Latte',         price: 17000, category: 'coffee',     description: 'Espresso dengan susu segar, disajikan dingin',    isAvailable: true },
    { name: 'Butterscotch',      price: 20000, category: 'coffee',     description: 'Latte dengan rasa butterscotch yang creamy',      isAvailable: true },
    { name: 'Caramel Macchiato', price: 22000, category: 'coffee',     description: 'Espresso dengan susu dan drizzle karamel',        isAvailable: true },
    { name: 'Vanilla Latte',     price: 22000, category: 'coffee',     description: 'Latte dengan sirup vanilla yang lembut',          isAvailable: true },
    { name: 'Caramel Cookies',   price: 23000, category: 'coffee',     description: 'Latte dengan rasa karamel dan cookies',           isAvailable: true },
    { name: 'Hazelnut',          price: 23000, category: 'coffee',     description: 'Latte dengan sirup hazelnut',                    isAvailable: true },
    { name: 'Popcorn',           price: 23000, category: 'coffee',     description: 'Latte dengan rasa popcorn yang unik',             isAvailable: true },
    { name: 'Vanilla Cheese',    price: 23000, category: 'coffee',     description: 'Latte dengan topping vanilla cheese foam',        isAvailable: true },
    { name: 'Coffee Latte',      price: 24000, category: 'coffee',     description: 'Coffee latte klasik, tersedia Hot',               isAvailable: true },

    // ── Americano Series ──────────────────────────────────
    { name: 'Americano',         price: 20000, category: 'americano',  description: 'Espresso dengan air, tersedia Hot/Ice',           isAvailable: true },
    { name: 'Americano Peach',   price: 22000, category: 'americano',  description: 'Americano dengan tambahan rasa peach, Hot/Ice',   isAvailable: true },
    { name: 'Berrycano',         price: 22000, category: 'americano',  description: 'Americano dengan rasa berry segar, Hot/Ice',      isAvailable: true },

    // ── Slow Bar ──────────────────────────────────────────
    { name: 'Kopi Filter / Japanese V60', price: 22000, category: 'slow-bar', description: 'Pour over manual brew, tersedia filter & V60', isAvailable: true },

    // ── Non Coffee ────────────────────────────────────────
    { name: 'Cokelat Biskuit',   price: 18000, category: 'non-coffee', description: 'Minuman cokelat dengan rasa biskuit',             isAvailable: true },
    { name: 'Iced Pandan Latte', price: 18000, category: 'non-coffee', description: 'Latte pandan segar disajikan dingin',             isAvailable: true },
    { name: 'Jagoan Neon',       price: 18000, category: 'non-coffee', description: 'Minuman segar berwarna neon yang unik',           isAvailable: true },
    { name: 'Minthy Lychee',     price: 18000, category: 'non-coffee', description: 'Minuman lychee mint yang menyegarkan',            isAvailable: true },

    // ── Foods ─────────────────────────────────────────────
    { name: 'Kentang',           price: 10000, category: 'foods',      description: 'Kentang goreng renyah',                          isAvailable: true },
    { name: 'Kensos',            price: 15000, category: 'foods',      description: 'Kensos crispy',                                  isAvailable: true },
    { name: 'Sosis Bakar',       price: 10000, category: 'foods',      description: 'Sosis bakar dengan saus pilihan',                isAvailable: true },

    // ── Additional Espresso ───────────────────────────────
    { name: 'Additional Espresso Single Shot', price: 3000, category: 'additional', description: 'Tambahan single shot espresso',     isAvailable: true },
    { name: 'Additional Espresso Double Shot', price: 6000, category: 'additional', description: 'Tambahan double shot espresso',     isAvailable: true },
  ];

  const createdMenu = await prisma.menu.createMany({ data: menuData });
  console.log(`✅ ${createdMenu.count} menu berhasil dibuat\n`);

  // ─── Seed Meja ─────────────────────────────────────────
  const tableData = [
    { number: 1,  floor: 1 },
    { number: 2,  floor: 1 },
    { number: 3,  floor: 1 },
    { number: 4,  floor: 1 },
    { number: 5,  floor: 1 },
    { number: 6,  floor: 1 },
    { number: 7,  floor: 2 },
    { number: 8,  floor: 2 },
    { number: 9,  floor: 2 },
    { number: 10, floor: 2 },
    { number: 11, floor: 2 },
    { number: 12, floor: 2 },
  ];

  const createdTables = await prisma.table.createMany({ data: tableData });
  console.log(`✅ ${createdTables.count} meja berhasil dibuat\n`);

  // ─── Summary ───────────────────────────────────────────
  const counts = {
    total:      await prisma.menu.count(),
    signature:  await prisma.menu.count({ where: { category: 'signature' } }),
    coffee:     await prisma.menu.count({ where: { category: 'coffee' } }),
    americano:  await prisma.menu.count({ where: { category: 'americano' } }),
    slowbar:    await prisma.menu.count({ where: { category: 'slow-bar' } }),
    noncoffee:  await prisma.menu.count({ where: { category: 'non-coffee' } }),
    foods:      await prisma.menu.count({ where: { category: 'foods' } }),
    additional: await prisma.menu.count({ where: { category: 'additional' } }),
    tables:     await prisma.table.count(),
  };

  console.log(`
╔═══════════════════════════════════════╗
║       Carra Coffee — Seed Berhasil 🎉 ║
╠═══════════════════════════════════════╣
║ Total Menu   : ${String(counts.total).padEnd(24)}║
║  Signature   : ${String(counts.signature).padEnd(24)}║
║  Coffee      : ${String(counts.coffee).padEnd(24)}║
║  Americano   : ${String(counts.americano).padEnd(24)}║
║  Slow Bar    : ${String(counts.slowbar).padEnd(24)}║
║  Non Coffee  : ${String(counts.noncoffee).padEnd(24)}║
║  Foods       : ${String(counts.foods).padEnd(24)}║
║  Additional  : ${String(counts.additional).padEnd(24)}║
╠═══════════════════════════════════════╣
║ Total Meja   : ${String(counts.tables).padEnd(24)}║
╚═══════════════════════════════════════╝
  `);
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
