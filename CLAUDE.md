# Warung Order System — Project Context

## Problem Statement

Restoran/warung dengan **banyak meja di beberapa lantai** — customer di lantai 2 harus turun ke lantai 1 untuk pesan ke kasir, sangat tidak efisien.

**Solusi**: Customer scan QR code di meja mereka → pilih menu → order langsung dikirim ke dapur/kasir secara real-time. Tidak perlu install aplikasi apapun.

---

## User / Developer Context

- **Coding level**: Pemula (jarang coding) — jelaskan tiap langkah dengan detail, jangan skip penjelasan
- **OS**: macOS, Node.js v22.22.0
- **Deploy target**: Vercel (frontend) + Railway (backend + database)
- **Payment**: Skip dulu, fokus order flow — payment (Midtrans) diintegrasikan nanti di phase 2

---

## Tech Stack

### Frontend (`/frontend/`) — Next.js 14
**Satu project Next.js yang handle dua halaman**: customer page + dashboard kasir/dapur

| Package | Fungsi | Status |
|---|---|---|
| Next.js 14 | Framework (App Router + SSR) | wajib |
| Tailwind CSS | Styling, mobile responsive | wajib |
| React Query (TanStack) | Fetching data, loading & error state | wajib |
| Zustand | State management keranjang belanja | wajib |
| qrcode.react | Generate QR code per meja | wajib |
| socket.io-client | Real-time notif pesanan masuk | wajib |
| react-hot-toast | Notifikasi pop-up pesanan baru | wajib |
| Recharts | Grafik omzet harian/mingguan | opsional |
| Framer Motion | Animasi cart, notifikasi sukses | opsional |

### Backend (`/backend/`) — Node.js + Express
| Package | Fungsi | Status |
|---|---|---|
| Express 5 | REST API server utama | sudah install |
| Socket.IO 4 | WebSocket real-time ke kasir | sudah install |
| Prisma 7 | ORM, query database | sudah install |
| @prisma/client | Prisma client | sudah install |
| cors | CORS middleware | sudah install |
| dotenv | Environment variables | sudah install |
| jsonwebtoken | Auth JWT untuk halaman kasir | perlu install |
| zod | Validasi request body dari customer | perlu install |
| node-cron | Auto reset status meja, laporan harian | opsional |

### Database
- **Development**: SQLite (file lokal, tanpa install apapun) — `file:./dev.db`
- **Production (Railway)**: PostgreSQL — cukup ubah `provider = "sqlite"` → `provider = "postgresql"` + update DATABASE_URL

### Deployment
- **Frontend**: Vercel (free tier, deploy otomatis dari GitHub)
- **Backend + DB**: Railway (free tier)

---

## Core Features (Priority Order)

### Phase 1 (Build Now)
1. **CRUD Menu** — kelola daftar menu, harga, kategori
2. **Manajemen Meja** — daftar meja + generate QR code per meja
3. **Order Flow** — customer scan QR → pilih menu → submit order
4. **Real-time Notifications** — order masuk langsung muncul di kasir/dapur via Socket.IO
5. **Update Status Order** — kasir/dapur update status: pending → preparing → ready → done
6. **Laporan Sederhana** — ringkasan penjualan harian

### Phase 2 (Later)
- Integrasi payment **Midtrans** (QRIS 0.7%, VA gratis, Snap UI)
- Alur bayar: customer bayar lewat Midtrans → webhook → server verifikasi → order masuk dapur
- Foto menu (upload ke Cloudinary/S3)
- Redis untuk cache
- Laporan mingguan/bulanan dengan grafik

---

## User Flows

### Customer Flow (mobile browser, no app install)
1. Scan QR code di meja → buka URL `http://localhost:3000/meja/7`
2. Lihat menu berdasarkan kategori (Makanan / Minuman)
3. Tambah item ke keranjang, isi catatan opsional
4. Submit order → terima konfirmasi + nomor order
5. Pantau status order secara real-time di halaman yang sama

### Kasir / Dapur Flow (tablet/laptop)
1. Buka dashboard kasir → login dengan password
2. Terima notifikasi real-time saat order baru masuk (react-hot-toast + Socket.IO)
3. Filter pesanan per lantai atau per meja
4. Update status: pending → preparing → ready → done
5. Lihat ringkasan transaksi harian

### Admin Flow
1. Login ke admin panel
2. CRUD menu (tambah/edit/hapus item, set harga, kategori, ketersediaan)
3. Manage meja (tambah meja, lihat QR code, reset status)
4. Lihat laporan penjualan

---

## Data Models (Prisma Schema — Planned)

```prisma
model Menu {
  id          Int      @id @default(autoincrement())
  name        String
  description String?
  price       Int      // dalam Rupiah
  category    String   // "makanan" | "minuman"
  imageUrl    String?
  isAvailable Boolean  @default(true)
  createdAt   DateTime @default(now())
  orderItems  OrderItem[]
}

model Table {
  id         Int     @id @default(autoincrement())
  number     Int     @unique
  floor      Int     @default(1)  // lantai 1, 2, dst
  qrCode     String? // URL encoded QR
  isOccupied Boolean @default(false)
  orders     Order[]
}

model Order {
  id          Int         @id @default(autoincrement())
  tableId     Int
  table       Table       @relation(fields: [tableId], references: [id])
  status      String      @default("pending") // pending | preparing | ready | done
  totalAmount Int
  notes       String?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  items       OrderItem[]
}

model OrderItem {
  id       Int    @id @default(autoincrement())
  orderId  Int
  order    Order  @relation(fields: [orderId], references: [id])
  menuId   Int
  menu     Menu   @relation(fields: [menuId], references: [id])
  quantity Int
  price    Int    // harga saat order (snapshot)
  notes    String?
}
```

---

## Project Structure (Target)

```
warung-order-system/
├── CLAUDE.md
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── menu.js       # CRUD menu
│   │   │   ├── orders.js     # buat & update order
│   │   │   ├── tables.js     # manage meja + QR
│   │   │   └── auth.js       # login kasir
│   │   ├── middleware/
│   │   │   ├── auth.js       # JWT verification
│   │   │   └── validate.js   # Zod validation
│   │   └── socket/
│   │       └── handlers.js   # Socket.IO event handlers
│   ├── generated/prisma/     # auto-generated, jangan edit
│   ├── index.js              # entry point
│   ├── prisma.config.ts
│   ├── package.json
│   └── .env
└── frontend/
    ├── app/
    │   ├── meja/[id]/        # customer page (scan QR)
    │   │   └── page.jsx
    │   ├── kasir/            # kasir dashboard (auth protected)
    │   │   └── page.jsx
    │   ├── dapur/            # dapur view
    │   │   └── page.jsx
    │   └── admin/            # admin panel
    │       ├── menu/
    │       └── meja/
    ├── components/
    ├── lib/
    │   ├── api.js            # axios/fetch wrapper
    │   └── socket.js         # Socket.IO client singleton
    ├── store/
    │   └── cartStore.js      # Zustand cart state
    ├── package.json
    └── next.config.js
```

---

## API Endpoints (Planned)

```
# Menu
GET    /api/menu              → list semua menu aktif
POST   /api/menu              → tambah menu (auth kasir)
PUT    /api/menu/:id          → edit menu (auth kasir)
DELETE /api/menu/:id          → hapus menu (auth kasir)

# Tables
GET    /api/tables            → list semua meja
GET    /api/tables/:id        → detail meja + QR code
POST   /api/tables            → tambah meja (auth kasir)

# Orders
GET    /api/orders            → list semua order (auth kasir)
GET    /api/orders?tableId=7  → order per meja
POST   /api/orders            → buat order baru (public, dari customer)
PUT    /api/orders/:id/status → update status (auth kasir)

# Auth
POST   /api/auth/login        → login kasir → return JWT token
```

---

## Socket.IO Events

```
# Server → Client (emit ke kasir/dapur)
order:new           → { order } — order baru masuk
order:status_update → { orderId, status } — status berubah

# Client → Server (dari kasir)
order:update_status → { orderId, status }
```

---

## Dev Commands

```bash
# Backend
cd backend
node index.js                # run server → http://localhost:3000
npm run dev                  # run dengan nodemon (auto-restart)
npm run seed                 # reset + isi ulang database
npx prisma migrate dev       # jalankan migration baru
npx prisma studio            # Prisma GUI di browser

# Frontend
cd frontend
npm run dev -- -p 3001       # Next.js dev server → http://localhost:3001
npm run build                # build untuk production
```

## Status Phase 1 — SELESAI ✅

| Halaman | URL | Fitur |
|---|---|---|
| Customer | `/meja/[id]` | Scan QR, pilih menu, keranjang, order, tracking status, invoice |
| Kasir | `/kasir` | Real-time order, filter status/lantai, update status |
| Admin Menu | `/admin/menu` | CRUD menu, toggle ketersediaan, badge fitur Hot/Ice & Espresso Shot |
| Admin Meja | `/admin/meja` | Tambah/hapus meja, lihat QR code (kasir & owner) |
| Login | `/login` | Auth JWT, role-based redirect |
| Pengaturan | `/admin/pengaturan` | Jam buka/tutup, kelola akun kasir (owner only) |
| Laporan | `/admin/laporan` | Ringkasan penjualan, grafik, export CSV (owner only) |

## Fitur Tambahan Phase 1 (sudah selesai)
- ✅ Role leveling: **Owner** (full access) vs **Kasir** (akses terbatas)
- ✅ Kelola akun kasir dari halaman Pengaturan (CRUD user, owner only)
- ✅ Customer order tracking real-time: Diterima → Diproses → Siap
- ✅ Invoice customer muncul saat pesanan selesai
- ✅ Socket.IO reconnect + 10s polling fallback (handle tab suspension)
- ✅ QR code download sebagai PNG dengan label meja
- ✅ Kategori menu dinamis dari database
- ✅ Fitur menu: pilih Hot/Ice, tambah Espresso Shot, quick notes

## Phase 2 — Belum Dikerjakan
- [ ] Payment Midtrans (QRIS + Virtual Account)
- [ ] Upload foto menu (Cloudinary)
- [ ] Deploy ke Vercel + Railway (sudah pernah deploy, perlu update)

---

## Environment Variables

```bash
# backend/.env
DATABASE_URL="file:./dev.db"      # SQLite (dev)
# DATABASE_URL="postgresql://..."  # PostgreSQL (prod - Railway)
JWT_SECRET="your-secret-key"
PORT=3000
FRONTEND_URL="http://localhost:3001"

# frontend/.env.local
NEXT_PUBLIC_API_URL="http://localhost:3000"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3000"
```

---

## Ports

- Backend: **3000**
- Frontend (Next.js): **3001** (pakai port 3001 biar tidak konflik dengan backend)

---

## Notes & Keputusan Teknis

- **SQLite dulu** — tidak perlu install PostgreSQL di lokal, cukup 1 file. Saat deploy ke Railway, ganti 1 baris di schema.prisma
- **Next.js App Router** — gunakan `/app` directory, bukan `/pages`
- **1 project Next.js** untuk customer + kasir + admin (lebih simpel daripada 2 project terpisah)
- **QR code URL format**: `https://domain.com/meja/[nomor-meja]` — simple, no auth needed untuk customer
- **Kasir auth**: JWT simpan di localStorage (cukup untuk use case ini, tidak perlu refresh token)
- **Tidak pakai TypeScript** — pakai JavaScript biasa biar lebih mudah untuk pemula
- **Prisma output**: ke `generated/prisma` (sudah dikonfigurasi di prisma.config.ts)
