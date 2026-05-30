'use client';

// Known BLE service/characteristic pairs for common 58mm thermal printers
// RPP02N typically uses the first profile
const PROFILES = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', char: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', char: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', char: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
];

let _char = null;
let _device = null;

// ── ESC/POS primitives ─────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

const b = (...v) => new Uint8Array(v.flat());
const txt = (s) => new TextEncoder().encode(s);

const cmd = {
  init:      () => b(ESC, 0x40),
  lf:        () => b(LF),
  cut:       () => b(GS, 0x56, 0x42, 0x00),
  bold:      (on) => b(ESC, 0x45, on ? 1 : 0),
  center:    () => b(ESC, 0x61, 0x01),
  left:      () => b(ESC, 0x61, 0x00),
  dblHeight: () => b(ESC, 0x21, 0x10),
  normal:    () => b(ESC, 0x21, 0x00),
};

const W = 32; // chars per line at 58mm

function divider() { return txt('-'.repeat(W) + '\n'); }

function row(l, r) {
  const gap = W - l.length - r.length;
  return txt(l + ' '.repeat(Math.max(1, gap)) + r + '\n');
}

function concat(...arrays) {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let i = 0;
  for (const a of arrays) { out.set(a, i); i += a.length; }
  return out;
}

async function writeChunked(data) {
  const CHUNK = 512;
  for (let i = 0; i < data.length; i += CHUNK) {
    await _char.writeValueWithoutResponse(data.slice(i, i + CHUNK));
    if (i + CHUNK < data.length) await new Promise(r => setTimeout(r, 20));
  }
}

// ── Public API ─────────────────────────────────────────

export function isBTSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function isPrinterConnected() {
  return !!_char && !!_device?.gatt?.connected;
}

export function getPrinterName() {
  return _device?.name ?? null;
}

export async function connectPrinter() {
  if (!isBTSupported()) throw new Error('Web Bluetooth tidak didukung. Gunakan Chrome/Edge.');

  const serviceUUIDs = PROFILES.map(p => p.service);

  // Try filter by name first, fall back to acceptAllDevices
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ name: 'RPP02N' }],
    optionalServices: serviceUUIDs,
  }).catch(() =>
    navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: serviceUUIDs,
    })
  );

  const server = await device.gatt.connect();

  for (const p of PROFILES) {
    try {
      const svc = await server.getPrimaryService(p.service);
      const ch  = await svc.getCharacteristic(p.char);
      _char   = ch;
      _device = device;
      device.addEventListener('gattserverdisconnected', () => {
        _char = null; _device = null;
      });
      return device.name || 'Thermal Printer';
    } catch { /* try next profile */ }
  }

  throw new Error('Printer tidak dikenali. Pastikan printer menyala dan dalam jangkauan.');
}

export function disconnectPrinter() {
  if (_device?.gatt?.connected) _device.gatt.disconnect();
  _char = null;
  _device = null;
}

export async function printReceipt(order) {
  if (!isPrinterConnected()) throw new Error('Printer belum terhubung');

  const fmt = (n) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  const fmtDate = (s) =>
    new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const parts = [
    cmd.init(),
    cmd.lf(),
    cmd.center(), cmd.bold(true), cmd.dblHeight(),
    txt('CARRA COFFEE\n'),
    cmd.normal(), cmd.bold(false),
    cmd.lf(),
    cmd.left(),
    divider(),
    row('Invoice', `#${order.id}`),
    row('Tanggal', fmtDate(order.createdAt).slice(0, W - 9)),
    row('Meja', `${order.table?.number ?? '-'} Lt.${order.table?.floor ?? '-'}`),
    ...(order.customerName ? [row('Customer', order.customerName.slice(0, W - 10))] : []),
    row('Tipe', order.orderType === 'dine-in' ? 'Dine In' : 'Take Away'),
    row('Status', order.isPaid ? 'LUNAS' : 'BELUM BAYAR'),
    divider(),
  ];

  for (const item of (order.items || [])) {
    const name  = (item.menuName || item.menu?.name || '-').slice(0, W - 12);
    const price = fmt(item.price * item.quantity);
    const label = `${item.quantity}x ${name}`;
    if (label.length + price.length <= W) {
      parts.push(row(label, price));
    } else {
      parts.push(txt(label.slice(0, W) + '\n'));
      parts.push(row('', price));
    }
    if (item.notes) {
      parts.push(txt(`   ${item.notes.slice(0, W - 3)}\n`));
    }
  }

  if (order.notes) {
    parts.push(cmd.lf(), txt(`Catatan: ${order.notes.slice(0, W - 9)}\n`));
  }

  parts.push(
    divider(),
    cmd.bold(true),
    row('TOTAL', fmt(order.totalAmount)),
    cmd.bold(false),
    divider(),
    cmd.lf(),
    cmd.center(),
    txt('Terima kasih telah berkunjung!\n'),
    txt('-- Carra Coffee --\n'),
    cmd.lf(), cmd.lf(), cmd.lf(),
    cmd.cut(),
  );

  await writeChunked(concat(...parts));
}
