'use client';
// app/kasir/page.js
// Dashboard kasir — terima order real-time, update status

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getOrders, updateOrderStatus, markOrderPaid, bulkUpdateStatus, getMenu, editOrderItems, getCategories, getPendingYesterday } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/hooks/useAuth';
import StaffLayout from '@/components/StaffLayout';
import { isPrinterConnected, isPrintingNow, getConnectedName, connectPrinter, disconnectPrinter, printReceipt, tryAutoReconnect, hasRememberedPrinter, watchForPrinter } from '@/lib/thermalPrinter';

const formatRupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const formatTime = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

// Konfigurasi status — urutan, warna, label, tombol aksi
const STATUS_CONFIG = {
  pending:   { label: 'Menunggu',   color: 'bg-amber-50 text-amber-700 border-amber-200',  dot: 'bg-amber-400',  next: 'preparing', nextLabel: 'Proses' },
  preparing: { label: 'Diproses',   color: 'bg-blue-50 text-blue-700 border-blue-200',     dot: 'bg-blue-400',   next: 'done',      nextLabel: 'Selesai ✓' },
  done:      { label: 'Selesai',    color: 'bg-gray-50 text-gray-400 border-gray-200',     dot: 'bg-gray-300',   next: null,        nextLabel: null },
  cancelled: { label: 'Dibatalkan', color: 'bg-red-50 text-red-500 border-red-200',        dot: 'bg-red-400',    next: null,        nextLabel: null },
};

// ─── Notification sound via Web Audio API ─────────────
function playOrderSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [
      { freq: 880,  start: 0,    dur: 0.25 },
      { freq: 1100, start: 0.18, dur: 0.25 },
      { freq: 1320, start: 0.36, dur: 0.35 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    });
  } catch (_) {}
}

// ─── Browser Notification ──────────────────────────────
function showBrowserNotif(order) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const notif = new Notification('🛎️ Order Baru Masuk!', {
    body: `Meja ${order.table?.number} · ${formatRupiah(order.totalAmount)} · ${order.items?.length} item`,
    icon: '/favicon.ico',
    tag: `order-${order.id}`,
  });
  setTimeout(() => notif.close(), 8000);
}

// ─── Tab title flash ───────────────────────────────────
let flashInterval = null;
function flashTabTitle(count = 6) {
  clearInterval(flashInterval);
  const original = document.title;
  let i = 0;
  flashInterval = setInterval(() => {
    document.title = i % 2 === 0 ? '🛎️ Order Baru!' : original;
    if (++i >= count * 2) { clearInterval(flashInterval); document.title = original; }
  }, 600);
}

export default function KasirPage() {
  const { user, loading, logout } = useAuth(); // proteksi halaman
  const router = useRouter();
  const [showAllDates, setShowAllDates] = useState(false);
  const [activeStatus, setActiveStatus] = useState('semua');
  const [activeFloor, setActiveFloor] = useState('semua');
  const [activePayment, setActivePayment] = useState('semua');
  const [activeType, setActiveType] = useState('semua');
  const [notifPermission, setNotifPermission] = useState('default');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dismissedLowStock, setDismissedLowStock] = useState(false);
  const [payModalOrder, setPayModalOrder] = useState(null);
  const [invoiceOrder, setInvoiceOrder] = useState(null);
  const [editOrder, setEditOrder] = useState(null);
  const [printerName, setPrinterName] = useState(null);
  const [printerConnecting, setPrinterConnecting] = useState(false);
  const queryClient = useQueryClient();

  const handleConnectPrinter = async () => {
    if (isPrinterConnected()) { disconnectPrinter(); setPrinterName(null); return; }
    setPrinterConnecting(true);
    try {
      const name = await connectPrinter();
      setPrinterName(name);
      toast.success(`🖨️ Printer "${name}" terhubung!`);
    } catch (err) {
      toast.error(err.message || 'Gagal menghubungkan printer');
    } finally {
      setPrinterConnecting(false);
    }
  };

  const handlePrintOrder = async (order) => {
    if (isPrintingNow()) { toast('Sedang mencetak...'); return; }

    // Kalau belum connect — coba reconnect tanpa buka picker
    if (!isPrinterConnected() && typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
      setPrinterConnecting(true);
      const remembered = await hasRememberedPrinter();

      if (remembered) {
        // Device sudah pernah dipair — reconnect silent, JANGAN buka picker
        const tid = toast.loading('🖨️ Menghubungkan printer...');
        const reconnected = await tryAutoReconnect();
        if (reconnected) {
          setPrinterName(getConnectedName() || 'Printer');
          toast.success('🖨️ Printer terhubung!', { id: tid });
        } else {
          toast.error('Printer tidak terjangkau. Pastikan RPP02N menyala.', { id: tid });
          setPrinterConnecting(false);
          return; // jangan lanjut print, jangan buka picker
        }
      } else {
        // Pertama kali — buka picker sekali saja
        try {
          const name = await connectPrinter();
          setPrinterName(name);
          toast.success(`🖨️ "${name}" terhubung!`);
        } catch (err) {
          setPrinterConnecting(false);
          toast.error(err.message || 'Gagal menghubungkan printer');
          return;
        }
      }
      setPrinterConnecting(false);
    }

    if (isPrinterConnected()) {
      const tid = toast.loading('🖨️ Mencetak struk...');
      try {
        await printReceipt(order, user?.name || user?.username);
        toast.success('🖨️ Struk dicetak!', { id: tid });
      } catch (err) {
        toast.error(err.message || 'Gagal cetak', { id: tid });
      }
    } else {
      // Fallback ke iframe print
      const fmt = (n) =>
        new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
      const fmtDt = (s) => new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const itemRows = (order.items || []).map((item) => `
        <tr>
          <td style="padding:3px 0">${item.quantity}x ${item.menuName || item.menu?.name || '-'}${item.notes ? `<br><small style="color:#888">↳ ${item.notes}</small>` : ''}</td>
          <td style="text-align:right;padding:3px 0;white-space:nowrap">${fmt(item.price * item.quantity)}</td>
        </tr>`).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice #${order.id}</title>
<style>@page{size:58mm auto;margin:2mm 0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;color:#000;width:54mm;padding:2mm}.center{text-align:center}.bold{font-weight:bold}.divider{border-top:1px dashed #999;margin:4px 0}table{width:100%;border-collapse:collapse}td{font-size:11px;vertical-align:top}.total-row td{font-weight:bold;font-size:13px;padding-top:4px}.footer{text-align:center;margin-top:6px;font-size:10px;color:#555}</style>
</head><body>
<div class="center" style="margin-bottom:10px"><div class="bold" style="font-size:16px">CARRA COFFEE</div></div>
<div class="divider"></div>
<table style="margin-bottom:8px">
<tr><td style="color:#555">Invoice</td><td style="text-align:right">#${order.id}</td></tr>
<tr><td style="color:#555">Tanggal</td><td style="text-align:right">${fmtDt(order.createdAt)}</td></tr>
<tr><td style="color:#555">Meja</td><td style="text-align:right">Meja ${order.table?.number} · Lantai ${order.table?.floor}</td></tr>
${order.customerName ? `<tr><td style="color:#555">Customer</td><td style="text-align:right">${order.customerName}</td></tr>` : ''}
<tr><td style="color:#555">Tipe</td><td style="text-align:right">${order.orderType === 'dine-in' ? 'Dine In' : 'Take Away'}</td></tr>
<tr><td style="color:#555">Pembayaran</td><td style="text-align:right;font-weight:bold">${order.isPaid ? 'LUNAS' : 'BELUM BAYAR'}</td></tr>
</table><div class="divider"></div>
<table style="margin-bottom:4px">${itemRows}</table>
<div class="divider"></div>
<table><tr class="total-row"><td>TOTAL</td><td style="text-align:right">${fmt(order.totalAmount)}</td></tr></table>
<div class="divider"></div>
<div class="footer"><div>Terima kasih telah berkunjung!</div><div>— Carra Coffee —</div></div>
</body></html>`;
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write(html);
      iframe.contentDocument.close();
      iframe.onload = () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 2000);
      };
    }
  };

  // Cek & minta permission notifikasi saat pertama kali load
  useEffect(() => {
    if (!('Notification' in window)) return;
    setNotifPermission(Notification.permission);
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => setNotifPermission(p));
    }
  }, []);

  // Auto-reconnect ke printer yang pernah di-pair — silent, tanpa dialog
  useEffect(() => {
    tryAutoReconnect().then((connected) => {
      if (connected) {
        setPrinterName(getConnectedName() || 'Printer');
      } else {
        // Kalau gagal connect (printer mati), watch advertisements supaya auto-connect saat printer nyala
        watchForPrinter((name) => setPrinterName(name));
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Semua hooks harus dipanggil sebelum early return
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', showAllDates],
    queryFn: () => getOrders(showAllDates ? { date: 'all' } : undefined),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    enabled: !loading,
  });

  // Order kemarin yang belum selesai — untuk banner notifikasi
  const { data: yesterdayPending } = useQuery({
    queryKey: ['orders-pending-yesterday'],
    queryFn: getPendingYesterday,
    refetchInterval: false,
    enabled: !loading,
  });

  // Socket.IO — terima order baru & update status real-time
  useEffect(() => {
    if (loading) return; // skip kalau auth belum selesai
    const socket = getSocket();
    socket.connect();

    // Order baru masuk dari customer
    socket.on('order:new', (newOrder) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      playOrderSound();
      showBrowserNotif(newOrder);
      flashTabTitle(8);
      toast.custom((t) => (
        <div className={`bg-white rounded-2xl shadow-lg p-4 flex gap-3 items-start max-w-sm ${t.visible ? 'animate-enter' : 'animate-leave'}`}
          style={{ border: '2px solid #658051' }}>
          <div className="text-2xl">🛎️</div>
          <div>
            <p className="font-bold" style={{ color: '#1C1C1A' }}>Order Baru Masuk!</p>
            <p className="text-sm" style={{ color: '#6B7560' }}>Meja {newOrder.table?.number} — {formatRupiah(newOrder.totalAmount)}</p>
            <p className="text-xs mt-1" style={{ color: '#9CA38F' }}>{newOrder.items?.length} item · #{newOrder.id}</p>
          </div>
        </div>
      ), { duration: 8000 });
    });

    // Status order diupdate
    socket.on('order:status_update', () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    });

    // Reconnect setelah tab wake up / koneksi putus — langsung sync data terbaru
    socket.on('connect', () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    });

    return () => {
      socket.off('order:new');
      socket.off('order:status_update');
      socket.off('connect');
      socket.disconnect();
    };
  }, [queryClient, loading]);

  // Update status order
  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateOrderStatus(id, status),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(`Status diperbarui: ${STATUS_CONFIG[status]?.label}`);
    },
    onError: () => toast.error('Gagal mengubah status'),
  });

  // Bulk update status
  const bulkMutation = useMutation({
    mutationFn: ({ ids, status }) => bulkUpdateStatus(ids, status),
    onSuccess: (_, { ids, status }) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSelectedIds(new Set());
      toast.success(`${ids.length} order → ${STATUS_CONFIG[status]?.label}`);
    },
    onError: () => toast.error('Gagal bulk update'),
  });

  // Mark paid — di KasirPage supaya modal render di root (fix stacking context dari swipe transform)
  const rootMarkPaidMutation = useMutation({
    mutationFn: ({ id, notes }) => markOrderPaid(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(`Order #${payModalOrder?.id} ditandai lunas ✅`);
      setPayModalOrder(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal update status bayar'),
  });

  // Query menu untuk low stock alert
  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu-kasir'],
    queryFn: getMenu,
    refetchInterval: 60000,
    enabled: !loading,
  });
  const lowStockItems = menuItems.filter(
    (m) => m.stock !== null && m.stock <= 3 && m.isAvailable
  );

  // Tick setiap menit — paksa re-render supaya timer di order cards update real-time
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // Tampilkan loading sementara auth di-cek
  if (loading) return <LoadingAuth />;

  // Urgency score — urgent (≥10m) naik paling atas, warning (≥5m) di tengah
  const urgencyScore = (o) => {
    if (!['pending', 'preparing'].includes(o.status)) return 99;
    const m = getWaitMinutes(o.createdAt);
    if (m >= 10) return 0;
    if (m >= 5)  return 1;
    return 2;
  };

  // Urutan prioritas status — yang belum selesai muncul duluan
  const STATUS_PRIORITY = { pending: 0, preparing: 1, done: 2, cancelled: 3 };

  // Filter orders berdasarkan semua filter aktif, lalu sort by urgency → priority → time
  const filteredOrders = orders
    .filter((o) => {
      const statusMatch = activeStatus === 'semua' || o.status === activeStatus;
      const floorMatch = activeFloor === 'semua' || String(o.table?.floor) === activeFloor;
      const paymentMatch = activePayment === 'semua' || (activePayment === 'unpaid' ? !o.isPaid : o.isPaid);
      const typeMatch = activeType === 'semua' || o.orderType === activeType;
      return statusMatch && floorMatch && paymentMatch && typeMatch;
    })
    .sort((a, b) => {
      const urgDiff = urgencyScore(a) - urgencyScore(b);
      if (urgDiff !== 0) return urgDiff;
      const pDiff = (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9);
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  // Hitung jumlah order per status (untuk badge di stat cards)
  const counts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  // Hitung jumlah belum bayar (untuk badge filter)
  const unpaidCount = orders.filter((o) => !o.isPaid && o.status !== 'cancelled').length;

  // Ambil daftar lantai yang unik
  const floors = [...new Set(orders.map((o) => o.table?.floor).filter(Boolean))].sort();

  // Total pendapatan hari ini (order done)
  const todayRevenue = orders
    .filter((o) => o.status === 'done')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <StaffLayout>
    <div className="min-h-screen" style={{ background: '#F7F7F5' }}>
      {/* Header — hidden on mobile (top bar sudah ada di StaffLayout) */}
      <div className="hidden lg:flex bg-white border-b px-6 py-4 items-center justify-between sticky top-0 z-10 shadow-sm"
        style={{ borderColor: '#E8ECE4' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1C1C1A' }}>Dashboard Kasir</h1>
          <p className="text-sm" style={{ color: '#9CA38F' }}>Update status pesanan secara real-time</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs" style={{ color: '#9CA38F' }}>Total order hari ini</p>
            <p className="text-lg font-bold" style={{ color: '#658051' }}>{orders.length} order</p>
          </div>
          {/* Printer connect toggle — desktop only (Web Bluetooth tidak support iOS/mobile) */}
          <button
            onClick={handleConnectPrinter}
            disabled={printerConnecting}
            className="hidden lg:flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-semibold text-sm border transition"
            style={printerName
              ? { background: '#EDF1EA', borderColor: '#658051', color: '#658051' }
              : { background: '#F7F7F5', borderColor: '#E8ECE4', color: '#6B7560' }}
            title={printerName ? `Terhubung ke ${printerName} — klik untuk putus` : 'Hubungkan thermal printer'}
          >
            🖨️ {printerConnecting ? '...' : printerName ? printerName : 'Printer'}
          </button>
          <button
            onClick={() => router.push('/kasir/order-baru')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition"
            style={{ background: '#658051' }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#4d6340'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#658051'}
          >
            <span>＋</span> Buat Order
          </button>
        </div>
      </div>

      {/* Banner izin notifikasi */}
      {notifPermission !== 'granted' && (
        <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3"
          style={{ background: notifPermission === 'denied' ? '#FEF2F2' : '#FFF8EC', borderBottom: '1px solid #E8ECE4' }}>
          <div className="flex items-center gap-2 text-sm">
            <span>{notifPermission === 'denied' ? '🔕' : '🔔'}</span>
            <span style={{ color: notifPermission === 'denied' ? '#DC2626' : '#92660A' }}>
              {notifPermission === 'denied'
                ? 'Notifikasi diblokir — aktifkan di pengaturan browser untuk terima alert order baru'
                : 'Izinkan notifikasi agar dapat alert order baru saat tab tidak aktif'}
            </span>
          </div>
          {notifPermission === 'default' && (
            <button
              onClick={() => Notification.requestPermission().then((p) => setNotifPermission(p))}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition"
              style={{ background: '#F59E0B', color: '#fff' }}
            >
              Izinkan
            </button>
          )}
        </div>
      )}

      {/* Low stock alert */}
      {!dismissedLowStock && lowStockItems.length > 0 && (
        <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3"
          style={{ background: '#FFF8EC', borderBottom: '1px solid #FDE68A' }}>
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="shrink-0">⚠️</span>
            <span className="font-semibold" style={{ color: '#92660A' }}>Stok hampir habis:</span>
            <span className="truncate" style={{ color: '#78350F' }}>
              {lowStockItems.map((m) => `${m.name} (sisa ${m.stock})`).join(' · ')}
            </span>
          </div>
          <button onClick={() => setDismissedLowStock(true)}
            className="text-xs shrink-0 px-2 py-1 rounded-lg font-medium transition"
            style={{ color: '#92660A', background: '#FDE68A' }}>
            Tutup
          </button>
        </div>
      )}

      {/* Banner order kemarin yang belum selesai */}
      {yesterdayPending?.count > 0 && (
        <div className="px-4 lg:px-6 py-3 flex items-center justify-between gap-3"
          style={{ background: '#FEF2F2', borderBottom: '1px solid #FECACA' }}>
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="shrink-0 text-lg">📋</span>
            <div className="min-w-0">
              <p className="font-semibold" style={{ color: '#DC2626' }}>
                {yesterdayPending.count} order kemarin belum selesai
              </p>
              <p className="text-xs truncate" style={{ color: '#9CA38F' }}>
                {yesterdayPending.data?.slice(0, 3).map(o => `#${o.id} Meja ${o.table?.number}`).join(' · ')}
                {yesterdayPending.count > 3 ? ` +${yesterdayPending.count - 3} lainnya` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAllDates(true)}
            className="text-xs shrink-0 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap"
            style={{ background: '#FEE2E2', color: '#DC2626' }}>
            Lihat Semua
          </button>
        </div>
      )}

      {/* Pendapatan mobile */}
      <div className="lg:hidden bg-white border-b px-4 py-2 flex items-center justify-between"
        style={{ borderColor: '#E8ECE4' }}>
        <div>
          <p className="text-xs" style={{ color: '#9CA38F' }}>Total order hari ini</p>
          <p className="text-sm font-bold" style={{ color: '#658051' }}>{orders.length} order</p>
        </div>
        <button
          onClick={() => router.push('/kasir/order-baru')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs text-white"
          style={{ background: '#658051' }}
        >
          <span>＋</span> Buat Order
        </button>
      </div>

      {/* Banner mode "semua tanggal" */}
      {showAllDates && (
        <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3"
          style={{ background: '#EFF6FF', borderBottom: '1px solid #BFDBFE' }}>
          <p className="text-sm" style={{ color: '#1D4ED8' }}>
            📅 Menampilkan semua order (semua tanggal)
          </p>
          <button
            onClick={() => setShowAllDates(false)}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap"
            style={{ background: '#DBEAFE', color: '#1D4ED8' }}>
            Kembali ke Hari Ini
          </button>
        </div>
      )}

      {/* Stats bar — klik untuk filter status */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 px-3 sm:px-6 py-3 sm:py-4">
        {['pending', 'preparing', 'done'].map((s) => (
          <div key={s}
            className={`rounded-xl p-2.5 sm:p-3 border text-center cursor-pointer transition active:scale-95 hover:scale-105 ${STATUS_CONFIG[s].color}`}
            style={activeStatus === s ? { outline: '2px solid #658051', outlineOffset: '2px' } : {}}
            onClick={() => setActiveStatus(s === activeStatus ? 'semua' : s)}>
            <p className="text-xl sm:text-2xl font-bold">{counts[s] || 0}</p>
            <p className="text-xs font-medium mt-0.5">{STATUS_CONFIG[s].label}</p>
          </div>
        ))}
      </div>

      {/* Filter bar — pembayaran, tipe pesanan, lantai */}
      <div className="px-3 sm:px-6 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">

        {/* Filter pembayaran */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border shrink-0"
          style={{ borderColor: '#E8ECE4' }}>
          {[
            { value: 'semua',  label: 'Semua' },
            { value: 'unpaid', label: unpaidCount > 0 ? `💰 Belum Bayar ${unpaidCount}` : '💰 Belum Bayar' },
            { value: 'paid',   label: '✅ Lunas' },
          ].map((opt) => (
            <button key={opt.value}
              onClick={() => setActivePayment(opt.value)}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap"
              style={activePayment === opt.value
                ? { background: opt.value === 'unpaid' ? '#F59E0B' : '#658051', color: '#fff' }
                : { color: '#6B7560' }}
              onMouseEnter={(e) => { if (activePayment !== opt.value) e.currentTarget.style.background = '#EDF1EA'; }}
              onMouseLeave={(e) => { if (activePayment !== opt.value) e.currentTarget.style.background = 'transparent'; }}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Filter tipe pesanan */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border shrink-0"
          style={{ borderColor: '#E8ECE4' }}>
          {[
            { value: 'semua',     label: 'Semua' },
            { value: 'dine-in',   label: '🪑 Dine In' },
            { value: 'take-away', label: '🥡 Take Away' },
          ].map((opt) => (
            <button key={opt.value}
              onClick={() => setActiveType(opt.value)}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap"
              style={activeType === opt.value
                ? { background: '#658051', color: '#fff' }
                : { color: '#6B7560' }}
              onMouseEnter={(e) => { if (activeType !== opt.value) e.currentTarget.style.background = '#EDF1EA'; }}
              onMouseLeave={(e) => { if (activeType !== opt.value) e.currentTarget.style.background = 'transparent'; }}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Filter lantai — hanya tampil kalau ada > 1 lantai */}
        {floors.length > 1 && (
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border shrink-0"
            style={{ borderColor: '#E8ECE4' }}>
            <button onClick={() => setActiveFloor('semua')}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap"
              style={activeFloor === 'semua' ? { background: '#658051', color: '#fff' } : { color: '#6B7560' }}
              onMouseEnter={(e) => { if (activeFloor !== 'semua') e.currentTarget.style.background = '#EDF1EA'; }}
              onMouseLeave={(e) => { if (activeFloor !== 'semua') e.currentTarget.style.background = 'transparent'; }}>
              Semua lantai
            </button>
            {floors.map((f) => (
              <button key={f} onClick={() => setActiveFloor(String(f))}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap"
                style={activeFloor === String(f) ? { background: '#658051', color: '#fff' } : { color: '#6B7560' }}
                onMouseEnter={(e) => { if (activeFloor !== String(f)) e.currentTarget.style.background = '#EDF1EA'; }}
                onMouseLeave={(e) => { if (activeFloor !== String(f)) e.currentTarget.style.background = 'transparent'; }}>
                Lantai {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Order list */}
      <div className="px-3 sm:px-6 pb-8 space-y-3">
        {isLoading ? (
          <div className="text-center py-16" style={{ color: '#9CA38F' }}>
            <div className="text-4xl mb-2 animate-spin">⏳</div>
            <p>Memuat order...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16" style={{ color: '#9CA38F' }}>
            <div className="text-5xl mb-3">📭</div>
            <p className="font-medium">Tidak ada order</p>
            <p className="text-sm mt-1">
              {activeStatus === 'semua' && activePayment === 'semua' && activeType === 'semua' && activeFloor === 'semua'
                ? 'Belum ada pesanan masuk'
                : 'Tidak ada order yang cocok dengan filter ini'}
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onUpdateStatus={(status) => statusMutation.mutate({ id: order.id, status })}
              isUpdating={statusMutation.isPending}
              isSelected={selectedIds.has(order.id)}
              onToggleSelect={(id) => setSelectedIds((prev) => {
                const next = new Set(prev);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              })}
              onOpenPayModal={(order) => setPayModalOrder(order)}
              onOpenInvoice={(order) => setInvoiceOrder(order)}
              onDirectPrint={handlePrintOrder}
              onEditOrder={(order) => setEditOrder(order)}
            />
          ))
        )}
      </div>

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl"
          style={{ background: '#1C1C1A', minWidth: '320px' }}>
          <span className="text-white font-semibold text-sm flex-1">
            {selectedIds.size} order dipilih
          </span>
          {['preparing', 'done'].map((s) => (
            <button key={s}
              onClick={() => bulkMutation.mutate({ ids: Array.from(selectedIds), status: s })}
              disabled={bulkMutation.isPending}
              className="px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
              style={{
                background: s === 'done' ? '#658051' : '#2563EB',
                color: '#fff',
              }}>
              {s === 'done' ? '✓ Selesai' : '▶ Proses'}
            </button>
          ))}
          <button onClick={() => setSelectedIds(new Set())}
            className="px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ background: '#374151', color: '#D1D5DB' }}>
            Batal
          </button>
        </div>
      )}
    </div>

    {/* Root-level modals — di luar card DOM supaya tidak kena stacking context dari swipe transform */}
    {payModalOrder && (
      <QuickPayModal
        order={payModalOrder}
        onConfirm={(notes) => rootMarkPaidMutation.mutate({ id: payModalOrder.id, notes })}
        onClose={() => setPayModalOrder(null)}
        isPending={rootMarkPaidMutation.isPending}
      />
    )}
    {invoiceOrder && (
      <InvoiceModal order={invoiceOrder} onClose={() => setInvoiceOrder(null)} />
    )}
    {editOrder && (
      <EditOrderModal
        order={editOrder}
        onClose={() => setEditOrder(null)}
        onSaved={() => { setEditOrder(null); queryClient.invalidateQueries({ queryKey: ['orders'] }); }}
      />
    )}
    </StaffLayout>
  );
}

// Hitung berapa menit sejak order dibuat
const getWaitMinutes = (dateStr) => Math.floor((Date.now() - new Date(dateStr)) / 60000);

// ─── Komponen OrderCard ───────────────────────────────
function OrderCard({ order, onUpdateStatus, isUpdating, isSelected, onToggleSelect, onOpenPayModal, onOpenInvoice, onDirectPrint, onEditOrder }) {
  const [expanded, setExpanded] = useState(true);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(null);

  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const nextStatus = cfg.next;

  // ── Swipe handlers ──────────────────────────────────
  const handleTouchStart = (e) => {
    if (!nextStatus || isUpdating) return;
    touchStartX.current = e.touches[0].clientX;
    setIsSwiping(true);
  };
  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    // Max swipe 80px
    setSwipeX(Math.max(-80, Math.min(80, dx)));
  };
  const handleTouchEnd = () => {
    if (Math.abs(swipeX) >= 60 && nextStatus) {
      onUpdateStatus(nextStatus);
    }
    setSwipeX(0);
    setIsSwiping(false);
    touchStartX.current = null;
  };

  const waitMins = getWaitMinutes(order.createdAt);
  const isUrgent = ['pending', 'preparing'].includes(order.status) && waitMins >= 10;
  const isWarning = ['pending', 'preparing'].includes(order.status) && waitMins >= 5 && waitMins < 10;

  // Swipe hint label
  const swipeThreshold = 60;
  const swipeTriggered = Math.abs(swipeX) >= swipeThreshold;
  const swipeLabel = nextStatus === 'preparing' ? '👨‍🍳 Proses' : nextStatus === 'done' ? '✓ Selesai' : null;

  return (
    <div className="relative overflow-hidden rounded-2xl"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}>
      {/* Swipe background hint */}
      {isSwiping && swipeLabel && (
        <div className="absolute inset-0 flex items-center rounded-2xl px-6"
          style={{
            background: swipeTriggered
              ? (nextStatus === 'done' ? '#658051' : '#2563EB')
              : '#F3F4F6',
            justifyContent: swipeX > 0 ? 'flex-start' : 'flex-end',
            zIndex: 0,
          }}>
          <span className="font-bold text-sm" style={{ color: swipeTriggered ? '#fff' : '#9CA38F' }}>
            {swipeX > 0 ? swipeLabel : swipeLabel}
          </span>
        </div>
      )}
      <div className="rounded-2xl shadow-sm border overflow-hidden transition relative"
        style={{
          background: '#FFFFFF',
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s ease',
          zIndex: 1,
          borderColor: isUrgent ? '#EF4444' : isWarning ? '#F59E0B' : '#E8ECE4',
          borderWidth: isUrgent || isWarning ? '2px' : '1px',
          boxShadow: isUrgent ? '0 0 0 3px rgba(239,68,68,0.15)' : isWarning ? '0 0 0 3px rgba(245,158,11,0.12)' : undefined,
        }}>
      {/* Strip atas untuk urgent/warning */}
      {isUrgent && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold animate-pulse"
          style={{ background: '#EF4444', color: '#fff' }}>
          <span>🔴</span> Menunggu {waitMins} menit — segera proses!
        </div>
      )}
      {isWarning && !isUrgent && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold"
          style={{ background: '#FEF3C7', color: '#92400E' }}>
          <span>⚠️</span> Menunggu {waitMins} menit
        </div>
      )}
      {/* Header order */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer transition"
        style={{ background: '#FFFFFF' }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#FAFAF8'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {/* Checkbox bulk select */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(order.id); }}
            className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition"
            style={{
              borderColor: isSelected ? '#658051' : '#D1D5DB',
              background: isSelected ? '#658051' : 'transparent',
            }}>
            {isSelected && <span className="text-white text-xs font-bold">✓</span>}
          </button>
          {/* Status dot */}
          <div className={`w-3 h-3 rounded-full ${cfg.dot} shrink-0 ${order.status !== 'done' ? 'animate-pulse' : ''}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold" style={{ color: '#1C1C1A' }}>Order #{order.id}</span>
              {order.customerName && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: '#EDF1EA', color: '#658051' }}>
                  👤 {order.customerName}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                {cfg.label}
              </span>
              {/* Badge waktu tunggu — muncul jika pending/preparing */}
              {['pending', 'preparing'].includes(order.status) && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={isUrgent
                    ? { background: '#FEE2E2', color: '#DC2626' }
                    : isWarning
                    ? { background: '#FEF3C7', color: '#D97706' }
                    : { background: '#F3F4F6', color: '#6B7280' }}>
                  {isUrgent ? '🔴' : isWarning ? '🟡' : '⏱️'} {waitMins}m
                </span>
              )}
              {!order.isPaid && (
                <span className="text-xs px-2 py-0.5 rounded-full border font-semibold"
                  style={{ background: '#FEF3C7', color: '#92400E', borderColor: '#FCD34D' }}>
                  💰 Belum Bayar
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <p className="text-sm" style={{ color: '#6B7560' }}>
                Meja {order.table?.number} · Lantai {order.table?.floor} · {formatTime(order.createdAt)}
              </p>
              {order.orderType === 'take-away' ? (
                <span className="text-xs bg-purple-100 text-purple-600 border border-purple-200 rounded-full px-2 py-0.5 font-medium">🥡 Take Away</span>
              ) : (
                <span className="text-xs rounded-full px-2 py-0.5 font-medium border"
                  style={{ background: '#EDF1EA', color: '#658051', borderColor: '#c8d8c0' }}>
                  🪑 Dine In
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="font-bold" style={{ color: '#658051' }}>{formatRupiah(order.totalAmount)}</p>
            <p className="text-xs" style={{ color: '#9CA38F' }}>{order.items?.length} item</p>
          </div>
          {/* Quick action button — langsung update status tanpa expand */}
          {nextStatus && (
            <button
              onClick={(e) => { e.stopPropagation(); onUpdateStatus(nextStatus); }}
              disabled={isUpdating}
              className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-bold text-white transition shrink-0 disabled:opacity-50"
              style={{
                background: nextStatus === 'done' ? '#658051' : '#2563EB',
              }}
              title={cfg.nextLabel}
            >
              {nextStatus === 'done' ? '✓' : '▶'} {cfg.nextLabel}
            </button>
          )}
          {/* Tombol edit order */}
          {order.status !== 'done' && order.status !== 'cancelled' && (
            <button
              onClick={(e) => { e.stopPropagation(); onEditOrder(order); }}
              className="flex items-center gap-1 px-2.5 h-8 rounded-xl border text-xs font-semibold transition shrink-0"
              style={{ borderColor: '#FCD34D', background: '#FEF3C7', color: '#92400E' }}
              title="Edit pesanan"
              onMouseEnter={(e) => { e.currentTarget.style.background = '#FDE68A'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#FEF3C7'; }}>
              ✏️ Edit
            </button>
          )}
          {/* Tombol print langsung ke thermal printer */}
          <button
            onClick={(e) => { e.stopPropagation(); onDirectPrint(order); }}
            className="w-8 h-8 flex items-center justify-center rounded-xl border text-base transition shrink-0"
            style={{ borderColor: '#E8ECE4', background: '#F7F7F5', color: '#6B7560' }}
            title="Print Invoice"
            onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF1EA'; e.currentTarget.style.borderColor = '#658051'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F7F7F5'; e.currentTarget.style.borderColor = '#E8ECE4'; }}>
            🖨️
          </button>
        </div>
      </div>

      {/* Catatan order — selalu tampil, tidak ikut collapsed */}
      {order.notes && (
        <div className="mx-4 mb-1 rounded-xl px-3 py-2.5 flex items-start gap-2 border"
          style={{ background: '#FFFBEB', borderColor: '#FCD34D' }}>
          <span className="text-base shrink-0">📋</span>
          <div>
            <p className="text-xs font-semibold" style={{ color: '#92400E' }}>Catatan dari customer:</p>
            <p className="text-sm font-medium mt-0.5" style={{ color: '#78350F' }}>{order.notes}</p>
          </div>
        </div>
      )}

      {/* Detail item (expandable) */}
      {expanded && (
        <div className="px-4 pb-4">
          <div className="border-t pt-3 space-y-2 mb-3" style={{ borderColor: '#E8ECE4' }}>
            {order.items?.map((item) => (
              <div key={item.id} className="flex items-start justify-between text-sm">
                <div className="flex-1">
                  <span className="font-medium" style={{ color: '#1C1C1A' }}>
                    {item.quantity}× {item.menuName || item.menu?.name}
                  </span>
                  {item.notes && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs">⚠️</span>
                      <p className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: '#FEF3C7', color: '#92400E' }}>{item.notes}</p>
                    </div>
                  )}
                </div>
                <span className="ml-2 shrink-0" style={{ color: '#6B7560' }}>{formatRupiah(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          {/* Tombol aksi */}
          {cfg.next && (
            <div className="flex gap-2">
              <button
                onClick={() => onUpdateStatus(cfg.next)}
                disabled={isUpdating}
                className="flex-1 text-white py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50"
                style={{ background: '#658051' }}
                onMouseEnter={(e) => { if (!isUpdating) e.currentTarget.style.background = '#4d6340'; }}
                onMouseLeave={(e) => { if (!isUpdating) e.currentTarget.style.background = '#658051'; }}
              >
                {cfg.nextLabel}
              </button>
              {order.status === 'pending' && (
                <button
                  onClick={() => onUpdateStatus('cancelled')}
                  disabled={isUpdating}
                  className="px-4 py-2.5 rounded-xl font-semibold text-sm border transition hover:bg-red-50"
                  style={{ borderColor: '#FCA5A5', color: '#DC2626' }}
                >
                  Batal
                </button>
              )}
            </div>
          )}

          {order.status === 'done' && (
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#658051' }}>
              <span>✅</span>
              <span>Pesanan selesai — {formatTime(order.updatedAt)}</span>
            </div>
          )}

          {/* Tombol Tandai Lunas — muncul jika belum bayar */}
          {!order.isPaid && (
            <button
              onClick={() => onOpenPayModal(order)}
              className="w-full mt-2 py-2.5 rounded-xl font-bold text-sm transition border-2"
              style={{ borderColor: '#F59E0B', color: '#92400E', background: '#FFFBEB' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#FEF3C7'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#FFFBEB'}>
              💰 Tandai Lunas
            </button>
          )}
        </div>
      )}

    </div>
    </div>
  );
}

// ─── QuickPayModal — tandai lunas dari kasir dashboard ───────
function QuickPayModal({ order, onConfirm, onClose, isPending }) {
  const [method, setMethod] = useState('cash');
  const [receivedRaw, setReceivedRaw] = useState('');

  const fmt = (n) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  const received  = parseInt(receivedRaw, 10) || 0;
  const change    = received - order.totalAmount;
  const canSubmit = method === 'qris' || (method === 'cash' && received >= order.totalAmount);

  const handleConfirm = () => {
    const payNote = method === 'cash'
      ? `[Bayar Cash: ${fmt(received)}, Kembalian: ${fmt(change)}]`
      : '[Bayar QRIS]';
    onConfirm(payNote);
  };

  const NUMPAD = ['1','2','3','4','5','6','7','8','9','C','0','⌫'];
  const padPress = (k) => {
    if (k === '⌫') setReceivedRaw((p) => p.slice(0,-1));
    else if (k === 'C') setReceivedRaw('');
    else setReceivedRaw((p) => { const n = p+k; return n.length > 10 ? p : n; });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden">
        <div className="flex justify-center pt-3 sm:hidden"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>

        {/* Header */}
        <div className="px-4 pt-3 pb-3 border-b flex items-center justify-between" style={{ borderColor: '#E8ECE4' }}>
          <div>
            <p className="font-bold text-sm" style={{ color: '#1C1C1A' }}>💰 Tandai Lunas — Order #{order.id}</p>
            {order.customerName && <p className="text-xs mt-0.5" style={{ color: '#9CA38F' }}>👤 {order.customerName}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-sm" style={{ background: '#F7F7F5', color: '#6B7560' }}>✕</button>
        </div>

        <div className="px-4 py-4 space-y-3 overflow-y-auto" style={{ maxHeight: '80vh' }}>
          {/* Total */}
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: '#EDF1EA' }}>
            <p className="text-xs font-semibold" style={{ color: '#6B7560' }}>Total Tagihan</p>
            <p className="text-xl font-bold" style={{ color: '#658051' }}>{fmt(order.totalAmount)}</p>
          </div>

          {/* Metode */}
          <div className="grid grid-cols-2 gap-2">
            {[{ v:'cash', l:'💵 Cash' },{ v:'qris', l:'📱 QRIS' }].map((o) => (
              <button key={o.v} onClick={() => { setMethod(o.v); setReceivedRaw(''); }}
                className="py-2.5 rounded-xl border-2 font-bold text-sm transition"
                style={method === o.v
                  ? { borderColor: '#658051', background: '#EDF1EA', color: '#658051' }
                  : { borderColor: '#E8ECE4', background: '#FAFAF8', color: '#1C1C1A' }}>
                {o.l}
              </button>
            ))}
          </div>

          {method === 'cash' && (
            <div className="space-y-3">
              {/* Display */}
              <div className="rounded-2xl px-4 py-3 border-2" style={{ borderColor: received > 0 ? (change >= 0 ? '#658051' : '#DC2626') : '#E8ECE4', background: '#FAFAF8' }}>
                <p className="text-xs font-semibold mb-0.5" style={{ color: '#9CA38F' }}>Uang Diterima</p>
                <p className="text-2xl font-bold" style={{ color: received > 0 ? (change >= 0 ? '#658051' : '#DC2626') : '#C8CCBE' }}>
                  {received > 0 ? fmt(received) : 'Rp —'}
                </p>
                {received > 0 && (
                  <p className="text-xs font-semibold mt-0.5" style={{ color: change >= 0 ? '#658051' : '#DC2626' }}>
                    {change >= 0 ? `✅ Kembalian ${fmt(change)}` : `⚠️ Kurang ${fmt(Math.abs(change))}`}
                  </p>
                )}
              </div>
              {/* Numpad 3×4 */}
              <div className="grid grid-cols-3 gap-2">
                {NUMPAD.map((k) => (
                  <button key={k} onClick={() => padPress(k)}
                    className="rounded-2xl font-bold flex items-center justify-center select-none"
                    style={{ height:'3rem', fontSize:'1.1rem',
                      background: k==='⌫' ? '#FEF2F2' : k==='C' ? '#F7F7F5' : '#FAFAF8',
                      color: k==='⌫' ? '#DC2626' : k==='C' ? '#6B7560' : '#1C1C1A',
                      border: `1.5px solid ${k==='⌫' ? '#FECACA' : '#E8ECE4'}` }}
                    onMouseDown={(e) => e.currentTarget.style.transform='scale(0.93)'}
                    onMouseUp={(e) => e.currentTarget.style.transform='scale(1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform='scale(1)'}>
                    {k}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {['00','000'].map((k) => (
                  <button key={k} onClick={() => padPress(k)}
                    className="rounded-2xl font-bold flex items-center justify-center select-none"
                    style={{ height:'3rem', fontSize:'1.1rem', background:'#FAFAF8', border:'1.5px solid #E8ECE4', color:'#1C1C1A' }}
                    onMouseDown={(e) => e.currentTarget.style.transform='scale(0.93)'}
                    onMouseUp={(e) => e.currentTarget.style.transform='scale(1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform='scale(1)'}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}

          {method === 'qris' && (
            <div className="rounded-2xl p-4 text-center border-2 border-dashed" style={{ borderColor: '#E8ECE4', background: '#FAFAF8' }}>
              <p className="text-3xl mb-2">📱</p>
              <p className="text-sm font-bold" style={{ color: '#1C1C1A' }}>Perlihatkan QRIS ke customer</p>
              <p className="text-xs mt-1" style={{ color: '#9CA38F' }}>Setelah dibayar, tekan konfirmasi</p>
            </div>
          )}

          <div className="space-y-2 pt-1">
            <button onClick={handleConfirm} disabled={!canSubmit || isPending}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition disabled:opacity-40"
              style={{ background: '#658051' }}>
              {isPending ? '⏳ Menyimpan...' : method === 'cash' ? (canSubmit ? `✅ Lunas · Kembalian ${fmt(change)}` : 'Masukkan jumlah uang') : '✅ Konfirmasi Lunas QRIS'}
            </button>
            <button onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-medium border"
              style={{ borderColor: '#E8ECE4', color: '#6B7560' }}>
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── InvoiceModal ─────────────────────────────────────
function InvoiceModal({ order, onClose }) {
  const fmt = (n) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  const formatDateTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleString('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  // Buka popup window baru dengan HTML struk — paling reliable untuk print
  const handlePrint = () => {
    const itemRows = (order.items || []).map((item) => `
      <tr>
        <td style="padding:3px 0">${item.quantity}x ${item.menuName || item.menu?.name || '-'}${item.notes ? `<br><small style="color:#888">↳ ${item.notes}</small>` : ''}</td>
        <td style="text-align:right;padding:3px 0;white-space:nowrap">${fmt(item.price * item.quantity)}</td>
      </tr>
    `).join('');

    const notesRow = order.notes
      ? `<tr><td colspan="2" style="padding:6px 0 0;font-size:11px;color:#555">Catatan: ${order.notes}</td></tr>`
      : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice #${order.id} — Carra Coffee</title>
  <style>
    @page {
      size: 58mm auto;
      margin: 2mm 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #000;
      background: #fff;
      width: 54mm;
      padding: 2mm 2mm;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #999; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { font-size: 11px; vertical-align: top; }
    .total-row td { font-weight: bold; font-size: 13px; padding-top: 4px; }
    .footer { text-align: center; margin-top: 6px; font-size: 10px; color: #555; }
    @media print {
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="center" style="margin-bottom:10px">
    <div class="bold" style="font-size:16px">CARRA COFFEE</div>
  </div>
  <div class="divider"></div>
  <table style="margin-bottom:8px">
    <tr><td style="color:#555">Invoice</td><td style="text-align:right">#${order.id}</td></tr>
    <tr><td style="color:#555">Tanggal</td><td style="text-align:right">${formatDateTime(order.createdAt)}</td></tr>
    <tr><td style="color:#555">Meja</td><td style="text-align:right">Meja ${order.table?.number} · Lantai ${order.table?.floor}</td></tr>
    ${order.customerName ? `<tr><td style="color:#555">Customer</td><td style="text-align:right">${order.customerName}</td></tr>` : ''}
    <tr><td style="color:#555">Tipe</td><td style="text-align:right">${order.orderType === 'dine-in' ? 'Dine In' : 'Take Away'}</td></tr>
    <tr><td style="color:#555">Pembayaran</td><td style="text-align:right;font-weight:bold">${order.isPaid ? 'LUNAS' : 'BELUM BAYAR'}</td></tr>
  </table>
  <div class="divider"></div>
  <table style="margin-bottom:4px">
    ${itemRows}
    ${notesRow}
  </table>
  <div class="divider"></div>
  <table>
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right">${fmt(order.totalAmount)}</td>
    </tr>
  </table>
  <div class="divider"></div>
  <div class="footer">
    <div>Terima kasih telah berkunjung!</div>
    <div>— Carra Coffee —</div>
  </div>

  <div class="no-print" style="margin-top:20px;text-align:center">
    <button onclick="window.print()" style="padding:10px 32px;font-size:14px;cursor:pointer;background:#1C1C1A;color:white;border:none;border-radius:8px;font-weight:bold">
      🖨️ Print
    </button>
  </div>

  <script>
    // Auto-trigger print dialog
    window.onload = () => { window.print(); };
  </script>
</body>
</html>`;

    // Pakai iframe invisible — tidak butuh popup permission, works di PWA
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '92vh' }}>

        {/* Drag handle mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header modal */}
        <div className="px-5 pt-3 pb-4 border-b shrink-0 flex items-center justify-between"
          style={{ borderColor: '#E8ECE4' }}>
          <div>
            <p className="font-bold text-base" style={{ color: '#1C1C1A' }}>🧾 Invoice #{order.id}</p>
            <p className="text-xs mt-0.5" style={{ color: '#9CA38F' }}>{formatDateTime(order.createdAt)}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-sm"
            style={{ background: '#F7F7F5', color: '#6B7560' }}>✕</button>
        </div>

        {/* Body invoice */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Info order */}
          <div className="rounded-2xl p-4 space-y-2" style={{ background: '#F7F7F5' }}>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <div>
                <p className="text-xs" style={{ color: '#9CA38F' }}>Meja</p>
                <p className="font-semibold" style={{ color: '#1C1C1A' }}>
                  Meja {order.table?.number} · Lantai {order.table?.floor}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: '#9CA38F' }}>Tipe</p>
                <p className="font-semibold" style={{ color: '#1C1C1A' }}>
                  {order.orderType === 'dine-in' ? '🪑 Dine In' : '🥡 Take Away'}
                </p>
              </div>
              {order.customerName && (
                <div className="col-span-2">
                  <p className="text-xs" style={{ color: '#9CA38F' }}>Customer</p>
                  <p className="font-semibold" style={{ color: '#1C1C1A' }}>👤 {order.customerName}</p>
                </div>
              )}
              <div>
                <p className="text-xs" style={{ color: '#9CA38F' }}>Status Order</p>
                <p className="font-semibold" style={{ color: '#1C1C1A' }}>
                  {STATUS_CONFIG[order.status]?.label || order.status}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: '#9CA38F' }}>Pembayaran</p>
                <p className="font-semibold" style={{ color: order.isPaid ? '#658051' : '#D97706' }}>
                  {order.isPaid ? '✅ Lunas' : '⏳ Belum Bayar'}
                </p>
              </div>
            </div>
          </div>

          {/* Divider label */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px" style={{ background: '#E8ECE4' }} />
            <p className="text-xs font-semibold px-2" style={{ color: '#9CA38F' }}>Detail Pesanan</p>
            <div className="flex-1 h-px" style={{ background: '#E8ECE4' }} />
          </div>

          {/* Item list */}
          <div className="space-y-2.5">
            {order.items?.map((item) => (
              <div key={item.id} className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: '#1C1C1A' }}>
                    {item.menuName || item.menu?.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#9CA38F' }}>
                    {item.quantity} × {fmt(item.price)}
                    {item.notes && ` · ${item.notes}`}
                  </p>
                </div>
                <p className="text-sm font-semibold ml-3 shrink-0" style={{ color: '#1C1C1A' }}>
                  {fmt(item.price * item.quantity)}
                </p>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
            style={{ background: '#EDF1EA', border: '1.5px solid #c8d8c0' }}>
            <p className="font-bold text-sm" style={{ color: '#658051' }}>Total</p>
            <p className="text-xl font-bold" style={{ color: '#658051' }}>{fmt(order.totalAmount)}</p>
          </div>

          {/* Catatan */}
          {order.notes && (
            <div className="rounded-xl px-3 py-2.5 border flex items-start gap-2"
              style={{ background: '#FFFBEB', borderColor: '#FCD34D' }}>
              <span className="shrink-0">📋</span>
              <div>
                <p className="text-xs font-semibold" style={{ color: '#92400E' }}>Catatan</p>
                <p className="text-sm mt-0.5" style={{ color: '#78350F' }}>{order.notes}</p>
              </div>
            </div>
          )}

          {/* Footer struk */}
          <div className="text-center py-2 border-t border-dashed" style={{ borderColor: '#E8ECE4' }}>
            <p className="text-xs font-semibold" style={{ color: '#658051' }}>☕ Carra Coffee</p>
            <p className="text-xs mt-0.5" style={{ color: '#9CA38F' }}>Terima kasih telah berkunjung!</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-5 pt-3 space-y-2 shrink-0 border-t" style={{ borderColor: '#E8ECE4' }}>
          <button onClick={handlePrint}
            className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition"
            style={{ background: '#1C1C1A' }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#374151'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#1C1C1A'}>
            🖨️ Print Invoice
          </button>
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium border transition"
            style={{ borderColor: '#E8ECE4', color: '#6B7560' }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#F7F7F5'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading saat cek auth ────────────────────────────
function LoadingAuth() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F7F5' }}>
      <div className="text-center" style={{ color: '#9CA38F' }}>
        <div className="text-4xl mb-3 animate-pulse">🔐</div>
        <p>Memeriksa sesi login...</p>
      </div>
    </div>
  );
}

// ─── EditOrderModal ───────────────────────────────────
function EditOrderModal({ order, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const fmt = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  // Cart: clone items dari order yang ada
  const [cart, setCart] = useState(() =>
    (order.items || []).map((item) => ({
      menuId:                  item.menuId,
      menuName:                item.menuName || item.menu?.name || '-',
      price:                   item.price,
      quantity:                item.quantity,
      notes:                   item.notes || '',
      additionalEspressoShots: item.additionalEspressoShots || 0,
      additionalEspressoPrice: item.additionalEspressoPrice || 0,
    }))
  );

  const [search, setSearch]           = useState('');
  const [activeCategory, setCategory] = useState('semua');
  const [addModal, setAddModal]       = useState(null); // item yang mau ditambah

  const { data: menu = [] }       = useQuery({ queryKey: ['menu'],       queryFn: getMenu });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories });

  const editMutation = useMutation({
    mutationFn: (items) => editOrderItems(order.id, items),
    onSuccess: () => { toast.success('Order berhasil diubah!'); onSaved(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal mengubah order'),
  });

  const totalAmount = cart.reduce((sum, i) => {
    const esp = (i.additionalEspressoShots || 0) * (i.additionalEspressoPrice || 0);
    return sum + (i.price + esp) * i.quantity;
  }, 0);

  const activeSlugs       = new Set(menu.map((m) => m.category));
  const filteredCategories = categories.filter((c) => activeSlugs.has(c.slug));
  const filteredMenu       = menu.filter((m) => {
    const catOk    = activeCategory === 'semua' || m.category === activeCategory;
    const searchOk = !search || m.name.toLowerCase().includes(search.toLowerCase());
    return catOk && searchOk && m.isAvailable;
  });

  const getCatEmoji = (slug) => categories.find((c) => c.slug === slug)?.emoji ?? '☕';

  const removeItem = (idx) => setCart((c) => c.filter((_, i) => i !== idx));
  const changeQty  = (idx, delta) => setCart((c) =>
    c.map((item, i) => i === idx ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item)
  );

  const handleAddItem = (item, { temperature, additionalEspressoShots, additionalEspressoPrice, notes }) => {
    setCart((c) => [...c, {
      menuId:                  item.id,
      menuName:                item.name,
      price:                   item.price,
      quantity:                1,
      notes:                   [temperature ? (temperature === 'hot' ? '🔥 Hot' : '🧊 Ice') : null, notes || null].filter(Boolean).join(' · '),
      additionalEspressoShots: additionalEspressoShots || 0,
      additionalEspressoPrice: additionalEspressoPrice || item.additionalEspressoPrice || 0,
    }]);
    setAddModal(null);
    toast.success(`${item.name} ditambahkan`);
  };

  const handleSave = () => {
    if (cart.length === 0) { toast.error('Minimal 1 item'); return; }
    editMutation.mutate(cart);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '92vh' }}>
        {/* Handle mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: '#E8ECE4' }}>
          <div>
            <h2 className="font-bold text-lg" style={{ color: '#1C1C1A' }}>✏️ Edit Order #{order.id}</h2>
            <p className="text-xs mt-0.5" style={{ color: '#9CA38F' }}>Meja {order.table?.number} · Lantai {order.table?.floor}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-sm"
            style={{ background: '#F7F7F5', color: '#6B7560' }}>✕</button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">

          {/* LEFT: Tambah menu */}
          <div className="flex flex-col sm:w-1/2 border-b sm:border-b-0 sm:border-r" style={{ borderColor: '#E8ECE4', maxHeight: '40vh', minHeight: '40vh' }}>
            <div className="px-4 py-3 space-y-2 shrink-0 border-b" style={{ borderColor: '#E8ECE4' }}>
              <p className="text-xs font-semibold" style={{ color: '#6B7560' }}>Tambah Item</p>
              <input type="text" placeholder="Cari menu..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none border"
                style={{ border: '1px solid #E8ECE4', background: '#FAFAF8' }} />
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                <button onClick={() => setCategory('semua')}
                  className="px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                  style={activeCategory === 'semua' ? { background: '#658051', color: '#fff' } : { background: '#F7F7F5', color: '#6B7560' }}>
                  Semua
                </button>
                {filteredCategories.map((cat) => (
                  <button key={cat.slug} onClick={() => setCategory(cat.slug)}
                    className="px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                    style={activeCategory === cat.slug ? { background: '#658051', color: '#fff' } : { background: '#F7F7F5', color: '#6B7560' }}>
                    {cat.emoji} {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredMenu.map((item) => (
                <button key={item.id} onClick={() => {
                    if (item.hasTemperatureOption || item.hasAdditionalEspresso) {
                      setAddModal(item);
                    } else {
                      handleAddItem(item, {});
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left border-b transition"
                  style={{ borderColor: '#F3F4F6' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F7F7F5'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <span className="text-lg shrink-0">{getCatEmoji(item.category)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: '#1C1C1A' }}>{item.name}</p>
                    <p className="text-xs" style={{ color: '#658051' }}>{fmt(item.price)}</p>
                  </div>
                  <span className="text-xs font-bold shrink-0" style={{ color: '#658051' }}>+ Tambah</span>
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT: Cart items */}
          <div className="flex flex-col sm:w-1/2 min-h-0">
            <div className="px-4 py-3 shrink-0 border-b" style={{ borderColor: '#E8ECE4' }}>
              <p className="text-xs font-semibold" style={{ color: '#6B7560' }}>Item Saat Ini ({cart.length})</p>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {cart.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: '#9CA38F' }}>Tidak ada item</p>
              ) : cart.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl border" style={{ background: '#FAFAF8', borderColor: '#E8ECE4' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: '#1C1C1A' }}>{item.menuName}</p>
                    <p className="text-xs" style={{ color: '#658051' }}>{fmt(item.price)}/pcs</p>
                    {item.notes && (
                      <p className="text-xs mt-0.5 px-2 py-0.5 rounded-full inline-block" style={{ background: '#FEF3C7', color: '#92400E' }}>
                        {item.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => changeQty(idx, -1)}
                      className="w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center"
                      style={{ background: '#FEE2E2', color: '#DC2626' }}>−</button>
                    <span className="text-sm font-bold w-5 text-center" style={{ color: '#1C1C1A' }}>{item.quantity}</span>
                    <button onClick={() => changeQty(idx, 1)}
                      className="w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center text-white"
                      style={{ background: '#658051' }}>+</button>
                    <button onClick={() => removeItem(idx)}
                      className="w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center ml-1"
                      style={{ background: '#FEE2E2', color: '#DC2626' }} title="Hapus item">✕</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-4 border-t space-y-2 shrink-0" style={{ borderColor: '#E8ECE4' }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: '#6B7560' }}>Total Baru</span>
                <span className="text-lg font-bold" style={{ color: '#658051' }}>{fmt(totalAmount)}</span>
              </div>
              <button onClick={handleSave} disabled={editMutation.isPending || cart.length === 0}
                className="w-full py-3 rounded-xl font-bold text-sm text-white transition disabled:opacity-50"
                style={{ background: '#658051' }}
                onMouseEnter={(e) => { if (!editMutation.isPending) e.currentTarget.style.background = '#4d6340'; }}
                onMouseLeave={(e) => e.currentTarget.style.background = '#658051'}>
                {editMutation.isPending ? '⏳ Menyimpan...' : '✅ Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mini AddItemModal untuk item dengan opsi */}
      {addModal && (
        <EditAddItemModal
          item={addModal}
          onConfirm={(opts) => handleAddItem(addModal, opts)}
          onClose={() => setAddModal(null)}
        />
      )}
    </div>
  );
}

// ─── Mini modal untuk item dengan opsi (suhu/espresso) ─
function EditAddItemModal({ item, onConfirm, onClose }) {
  const fmt = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  const [temp, setTemp]           = useState(item.hasTemperatureOption ? null : 'none');
  const [chips, setChips]         = useState([]);
  const [espresso, setEspresso]   = useState(0);
  const [customNote, setCustomNote] = useState('');

  const ICE_CHIPS = ['Less ice', 'No ice'];
  const isHot = temp === 'Hot';
  const canConfirm = !item.hasTemperatureOption || temp !== null;

  const toggleChip = (chip) => {
    if (isHot && ICE_CHIPS.includes(chip)) return;
    setChips((p) => p.includes(chip) ? p.filter((c) => c !== chip) : [...p, chip]);
  };
  const handleTempSelect = (t) => {
    setTemp(t);
    if (t === 'Hot') setChips((p) => p.filter((c) => !ICE_CHIPS.includes(c)));
  };

  const notes = [chips.join(', '), customNote.trim()].filter(Boolean).join(' · ');
  const quickNotes = ['Less sugar', 'Less ice', 'No ice', 'Extra sweet', 'No sugar'];

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
        <div className="overflow-y-auto px-5 pb-2 pt-2 flex-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base" style={{ color: '#1C1C1A' }}>{item.name}</h3>
              <p className="text-sm font-semibold" style={{ color: '#658051' }}>{fmt(item.price)}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-sm"
              style={{ background: '#F7F7F5', color: '#6B7560' }}>✕</button>
          </div>

          {item.hasTemperatureOption && (
            <div className="mb-4">
              <p className="text-sm font-semibold mb-2" style={{ color: '#1C1C1A' }}>Pilih Suhu <span style={{ color: '#E84040' }}>*</span></p>
              <div className="grid grid-cols-2 gap-2">
                {[{ v: 'Ice', e: '🧊', ac: '#2563EB', ab: '#EFF6FF', ab2: '#93C5FD' }, { v: 'Hot', e: '♨️', ac: '#DC2626', ab: '#FEF2F2', ab2: '#FCA5A5' }].map((opt) => (
                  <button key={opt.v} onClick={() => handleTempSelect(opt.v)}
                    className="flex flex-col items-center gap-1 py-3 rounded-2xl border-2 transition"
                    style={{ borderColor: temp === opt.v ? opt.ab2 : '#E8ECE4', background: temp === opt.v ? opt.ab : '#FAFAF8', color: temp === opt.v ? opt.ac : '#6B7560' }}>
                    <span className="text-2xl">{opt.e}</span>
                    <span className="font-bold text-sm">{opt.v}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.hasAdditionalEspresso && (
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#1C1C1A' }}>Espresso Shot</p>
                <p className="text-xs" style={{ color: '#9CA38F' }}>+{fmt(item.additionalEspressoPrice || 3000)}/shot</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setEspresso((s) => Math.max(0, s - 1))} disabled={espresso === 0}
                  className="w-8 h-8 rounded-xl border-2 font-bold flex items-center justify-center disabled:opacity-30"
                  style={{ borderColor: '#E8ECE4', color: '#658051' }}>−</button>
                <span className="w-6 text-center font-bold" style={{ color: '#1C1C1A' }}>{espresso}</span>
                <button onClick={() => setEspresso((s) => Math.min(10, s + 1))}
                  className="w-8 h-8 rounded-xl border-2 font-bold flex items-center justify-center"
                  style={{ borderColor: '#658051', background: '#EDF1EA', color: '#658051' }}>+</button>
              </div>
            </div>
          )}

          <div className="mb-2">
            <p className="text-sm font-semibold mb-2" style={{ color: '#1C1C1A' }}>Catatan</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {quickNotes.map((chip) => {
                const active = chips.includes(chip);
                const disabled = isHot && ICE_CHIPS.includes(chip);
                return (
                  <button key={chip} onClick={() => toggleChip(chip)} disabled={disabled}
                    className="px-3 py-1 rounded-full text-xs font-semibold border-2 transition"
                    style={disabled ? { background: '#F3F4F6', color: '#C4C9BD', borderColor: '#E5E7EB', textDecoration: 'line-through' }
                      : active ? { background: '#EDF1EA', color: '#658051', borderColor: '#658051' }
                      : { background: '#FAFAF8', color: '#6B7560', borderColor: '#E8ECE4' }}>
                    {active ? `✓ ${chip}` : `+ ${chip}`}
                  </button>
                );
              })}
            </div>
            <input type="text" value={customNote} onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Catatan lain..." className="w-full rounded-xl px-3 py-2 text-sm outline-none border"
              style={{ border: '1.5px solid #E8ECE4' }} />
          </div>
        </div>
        <div className="px-5 pb-6 pt-3 border-t" style={{ borderColor: '#F0F0EC' }}>
          <button onClick={() => onConfirm({ temperature: temp === 'none' ? '' : temp, additionalEspressoShots: espresso, additionalEspressoPrice: item.additionalEspressoPrice || 3000, notes })}
            disabled={!canConfirm}
            className="w-full py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-40"
            style={{ background: '#658051' }}>
            {item.hasTemperatureOption && !temp ? 'Pilih suhu dulu' : 'Tambah ke Pesanan'}
          </button>
        </div>
      </div>
    </div>
  );
}
