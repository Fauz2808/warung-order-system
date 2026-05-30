'use client';

// Known BLE service/characteristic pairs for common 58mm thermal printers
const PROFILES = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', char: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', char: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', char: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
];

let _char   = null;
let _device = null;
let _printing = false; // lock: prevent double-print

// ── ESC/POS primitives ─────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

const b   = (...v) => new Uint8Array(v.flat());
const CHAR_MAP = { ' · ': ', ', '·': ',', '•': '-', '🔥': 'Hot', '🧊': 'Ice', '✓': 'v', '→': '>', '←': '<' };

const txt = (s) => {
  // Normalize non-ASCII before encoding
  let clean = s;
  for (const [from, to] of Object.entries(CHAR_MAP)) clean = clean.replaceAll(from, to);
  // Remove remaining non-ASCII (emoji, etc.)
  const out = [];
  for (const ch of clean) {
    const code = ch.charCodeAt(0);
    if (code < 128) out.push(code);
  }
  return new Uint8Array(out);
};

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

const W = 32; // chars per line at 58mm normal font

const divider = () => txt('--------------------------------\n');

function row(l, r) {
  const gap = Math.max(1, W - l.length - r.length);
  return txt(l + ' '.repeat(gap) + r + '\n');
}

function concat(...arrays) {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let i = 0;
  for (const a of arrays) { out.set(a, i); i += a.length; }
  return out;
}

// Word-wrap text to fit within `width` chars, returns array of lines
function wrapText(text, width, indent = '') {
  const words = text.split(' ');
  const lines = [];
  let current = indent;
  for (const word of words) {
    if (current.length + word.length + (current === indent ? 0 : 1) <= width) {
      current += (current === indent ? '' : ' ') + word;
    } else {
      if (current !== indent) lines.push(current);
      current = indent + word;
    }
  }
  if (current !== indent) lines.push(current);
  return lines;
}

// Small chunks + generous delay — most BLE thermal printers need this
async function writeChunked(data) {
  const CHUNK = 100;
  const DELAY = 50; // ms between chunks
  for (let i = 0; i < data.length; i += CHUNK) {
    await _char.writeValueWithoutResponse(data.slice(i, i + CHUNK));
    if (i + CHUNK < data.length) {
      await new Promise(r => setTimeout(r, DELAY));
    }
  }
}

// ── Public API ─────────────────────────────────────────

export function isBTSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function isPrinterConnected() {
  return !!_char && !!_device?.gatt?.connected;
}

export function isPrintingNow() {
  return _printing;
}

export function getConnectedName() {
  return _device?.name ?? null;
}

export async function connectPrinter() {
  if (!isBTSupported()) throw new Error('Web Bluetooth tidak didukung. Gunakan Chrome/Edge.');

  const serviceUUIDs = PROFILES.map(p => p.service);

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
  const name = await _bindDevice(device, server);
  if (!name) throw new Error('Printer tidak dikenali. Pastikan printer menyala dan dalam jangkauan.');
  return name;
}

// Shared: bind device+char after gatt.connect(), set up auto-reconnect listener
async function _bindDevice(device, server) {
  for (const p of PROFILES) {
    try {
      const svc = await server.getPrimaryService(p.service);
      const ch  = await svc.getCharacteristic(p.char);
      _char   = ch;
      _device = device;

      // Auto-reconnect when printer comes back online (e.g. turned off then on)
      device.addEventListener('gattserverdisconnected', _onDisconnected);
      return device.name || 'Thermal Printer';
    } catch { /* try next profile */ }
  }
  return null;
}

let _reconnectTimer = null;

function _onDisconnected() {
  _char = null;
  // Retry silently every 3s up to 10 attempts
  let attempts = 0;
  const retry = () => {
    if (isPrinterConnected() || attempts >= 10) return;
    attempts++;
    _reconnectSilent().catch(() => {
      _reconnectTimer = setTimeout(retry, 3000);
    });
  };
  _reconnectTimer = setTimeout(retry, 3000);
}

async function _reconnectSilent() {
  if (!_device) return;
  try {
    const server = await _device.gatt.connect();
    await _bindDevice(_device, server);
  } catch {
    throw new Error('retry');
  }
}

export function disconnectPrinter() {
  clearTimeout(_reconnectTimer);
  if (_device) _device.removeEventListener('gattserverdisconnected', _onDisconnected);
  if (_device?.gatt?.connected) _device.gatt.disconnect();
  _char = null;
  _device = null;
}

// Check apakah ada printer yang pernah dipair (tanpa connect)
export async function hasRememberedPrinter() {
  if (!isBTSupported()) return false;
  try {
    const devices = await navigator.bluetooth.getDevices();
    return devices.length > 0;
  } catch {
    return false;
  }
}

// Auto-reconnect to previously paired printer — no picker dialog, with 8s timeout
export async function tryAutoReconnect() {
  if (!isBTSupported()) return false;
  if (isPrinterConnected()) return true;
  try {
    const remembered = await navigator.bluetooth.getDevices();
    if (!remembered.length) return false;

    for (const device of remembered) {
      try {
        // Timeout 8 detik — jangan tunggu lama kalau printer mati
        const server = await Promise.race([
          device.gatt.connect(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
        ]);
        const name = await _bindDevice(device, server);
        if (name) return true;
      } catch { /* printer mungkin mati, coba device berikutnya */ }
    }
    return false;
  } catch {
    return false;
  }
}

// Watch advertisements — auto-connect saat printer nyala tanpa perlu tap apapun
export async function watchForPrinter(onConnected) {
  if (!isBTSupported()) return;
  try {
    const remembered = await navigator.bluetooth.getDevices();
    for (const device of remembered) {
      try {
        await device.watchAdvertisements();
        device.addEventListener('advertisementreceived', async () => {
          if (isPrinterConnected()) return;
          try {
            const server = await device.gatt.connect();
            const name = await _bindDevice(device, server);
            if (name) onConnected(name);
          } catch { /* ignore */ }
        });
      } catch { /* watchAdvertisements not supported, skip */ }
    }
  } catch { /* ignore */ }
}

const fmt = (n) =>
  'Rp ' + Number(n || 0).toLocaleString('id-ID');

const fmtDate = (s) => {
  const d = new Date(s);
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}`;
};

// Detect payment method from order notes (format: "[Bayar Cash: ...]" or "[Bayar QRIS]")
function detectPayment(order) {
  if (!order.isPaid) return null;
  const notes = order.notes || '';
  if (notes.includes('QRIS')) return 'QRIS';
  if (notes.includes('Cash')) {
    // extract "Rp X" from "[Bayar Cash: Rp X, Kembalian: Rp Y]"
    const m = notes.match(/Bayar Cash: (Rp [\d.,]+)/);
    return m ? `Cash (${m[1]})` : 'Cash';
  }
  return 'Lunas';
}

export async function printReceipt(order, kasirName) {
  if (!isPrinterConnected()) throw new Error('Printer belum terhubung');
  if (_printing) throw new Error('Sedang mencetak, tunggu sebentar');

  _printing = true;
  const payment = detectPayment(order);

  try {
    const parts = [
      cmd.init(),
      cmd.lf(),
      // Header — centered bold double-height
      cmd.center(), cmd.bold(true), cmd.dblHeight(),
      txt('CARRA COFFEE\n'),
      cmd.normal(), cmd.bold(false),
      ...(kasirName ? [cmd.center(), txt(`Kasir: ${kasirName.slice(0, 24)}\n`), cmd.left()] : []),
      cmd.lf(),
      cmd.left(),
      divider(),
      // Order info
      row('No. Order:', `#${order.id}`),
      row('Tanggal:', fmtDate(order.createdAt)),
      row('Meja:', `${order.table?.number ?? '-'} Lt.${order.table?.floor ?? '-'}`),
      ...(order.customerName ? [row('Customer:', order.customerName.slice(0, 18))] : []),
      row('Tipe:', order.orderType === 'dine-in' ? 'Dine In' : 'Take Away'),
      row('Pembayaran:', payment ?? (order.isPaid ? 'LUNAS' : 'BELUM BAYAR')),
      divider(),
    ];

    // Items
    const items = order.items || [];
    if (items.length === 0) {
      parts.push(txt('(tidak ada item)\n'));
    } else {
      for (const item of items) {
        const espressoExtra = (item.additionalEspressoShots || 0) * (item.additionalEspressoPrice || 0);
        const unitPrice     = (item.price || 0) + espressoExtra;
        const totalPrice    = unitPrice * item.quantity;
        const name          = (item.menuName || item.menu?.name || '-').slice(0, 20);
        const label         = `${item.quantity}x ${name}`;
        const price         = fmt(totalPrice);

        if (label.length + price.length + 1 <= W) {
          parts.push(row(label, price));
        } else {
          parts.push(txt((label + '\n').slice(0, W + 1)));
          parts.push(row('', price));
        }
        if (item.additionalEspressoShots > 0) {
          parts.push(txt(`   +${item.additionalEspressoShots} Espresso Shot\n`));
        }
        if (item.notes) {
          // Max 50 chars, word-wrap to fit 32-char width with 3-space indent
          const noteText = item.notes.slice(0, 50);
          const noteLines = wrapText(noteText, W, '   ');
          for (const line of noteLines) parts.push(txt(line + '\n'));
        }
      }
    }

    if (order.notes) {
      parts.push(cmd.lf());
      const orderNoteLines = wrapText(order.notes.slice(0, 80), W);
      parts.push(txt('Catatan:\n'));
      for (const line of orderNoteLines) parts.push(txt(line + '\n'));
    }

    parts.push(
      divider(),
      cmd.bold(true),
      row('TOTAL:', fmt(order.totalAmount || 0)),
      cmd.bold(false),
      divider(),
      cmd.lf(),
      cmd.center(),
      txt('Terima kasih sudah berkunjung!\n'),
      txt('--- Carra Coffee ---\n'),
      cmd.lf(), cmd.lf(), cmd.lf(),
      cmd.cut(),
    );

    await writeChunked(concat(...parts));
  } finally {
    _printing = false;
  }
}
