'use client';
// app/kasir/page.js
// Dashboard kasir — terima order real-time, update status

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getOrders, updateOrderStatus } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/hooks/useAuth';
import StaffLayout from '@/components/StaffLayout';

const formatRupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const formatTime = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

// Konfigurasi status — urutan, warna, label, tombol aksi
const STATUS_CONFIG = {
  pending:   { label: 'Menunggu',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400', next: 'preparing', nextLabel: 'Proses ▶' },
  preparing: { label: 'Diproses',   color: 'bg-blue-100 text-blue-700 border-blue-200',       dot: 'bg-blue-400',   next: 'ready',    nextLabel: 'Siap ✓' },
  ready:     { label: 'Siap',       color: 'bg-green-100 text-green-700 border-green-200',    dot: 'bg-green-400',  next: 'done',     nextLabel: 'Selesai ✓✓' },
  done:      { label: 'Selesai',    color: 'bg-gray-100 text-gray-500 border-gray-200',       dot: 'bg-gray-300',   next: null,       nextLabel: null },
  cancelled: { label: 'Dibatalkan', color: 'bg-red-100 text-red-500 border-red-200',          dot: 'bg-red-400',    next: null,       nextLabel: null },
};

const FILTER_TABS = ['semua', 'pending', 'preparing', 'ready', 'done'];

export default function KasirPage() {
  const { user, loading, logout } = useAuth(); // proteksi halaman
  const [activeFilter, setActiveFilter] = useState('semua');
  const [activeFloor, setActiveFloor] = useState('semua');
  const queryClient = useQueryClient();

  // Semua hooks harus dipanggil sebelum early return
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => getOrders(),
    refetchInterval: 30000,
    enabled: !loading, // hanya fetch kalau auth sudah selesai dicek
  });

  // Socket.IO — terima order baru & update status real-time
  useEffect(() => {
    if (loading) return; // skip kalau auth belum selesai
    const socket = getSocket();
    socket.connect();

    // Order baru masuk dari customer
    socket.on('order:new', (newOrder) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.custom((t) => (
        <div className={`bg-white rounded-2xl shadow-lg p-4 flex gap-3 items-start max-w-sm ${t.visible ? 'animate-enter' : 'animate-leave'}`}>
          <div className="text-2xl">🛎️</div>
          <div>
            <p className="font-bold text-gray-800">Order Baru Masuk!</p>
            <p className="text-sm text-gray-500">Meja {newOrder.table?.number} — {formatRupiah(newOrder.totalAmount)}</p>
            <p className="text-xs text-gray-400 mt-1">{newOrder.items?.length} item</p>
          </div>
        </div>
      ), { duration: 6000 });
    });

    // Status order diupdate
    socket.on('order:status_update', () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    });

    return () => {
      socket.off('order:new');
      socket.off('order:status_update');
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

  // Tampilkan loading sementara auth di-cek
  if (loading) return <LoadingAuth />;

  // Filter orders berdasarkan tab & lantai
  const filteredOrders = orders.filter((o) => {
    const statusMatch = activeFilter === 'semua' || o.status === activeFilter;
    const floorMatch = activeFloor === 'semua' || String(o.table?.floor) === activeFloor;
    return statusMatch && floorMatch;
  });

  // Hitung jumlah order per status (untuk badge)
  const counts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  // Ambil daftar lantai yang unik
  const floors = [...new Set(orders.map((o) => o.table?.floor).filter(Boolean))].sort();

  // Total pendapatan hari ini (order done)
  const todayRevenue = orders
    .filter((o) => o.status === 'done')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <StaffLayout>
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-800">🖥️ Dashboard Kasir</h1>
          <p className="text-sm text-gray-400">Update status pesanan secara real-time</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-400">Pendapatan hari ini</p>
            <p className="text-lg font-bold text-green-600">{formatRupiah(todayRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 px-6 py-4">
        {['pending', 'preparing', 'ready', 'done'].map((s) => (
          <div key={s} className={`rounded-xl p-3 border text-center cursor-pointer transition hover:scale-105 ${STATUS_CONFIG[s].color}`}
            onClick={() => setActiveFilter(s === activeFilter ? 'semua' : s)}>
            <p className="text-2xl font-bold">{counts[s] || 0}</p>
            <p className="text-xs font-medium mt-0.5">{STATUS_CONFIG[s].label}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="px-6 pb-3 flex gap-2 flex-wrap">
        {/* Filter status */}
        <div className="flex gap-1.5 bg-white rounded-xl p-1 shadow-sm border">
          {FILTER_TABS.map((tab) => (
            <button key={tab} onClick={() => setActiveFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                activeFilter === tab ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>
              {tab === 'semua' ? 'Semua' : STATUS_CONFIG[tab]?.label}
              {tab !== 'semua' && counts[tab] ? (
                <span className="ml-1 bg-white/30 rounded-full px-1.5">{counts[tab]}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Filter lantai */}
        {floors.length > 1 && (
          <div className="flex gap-1.5 bg-white rounded-xl p-1 shadow-sm border">
            <button onClick={() => setActiveFloor('semua')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeFloor === 'semua' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              Semua lantai
            </button>
            {floors.map((f) => (
              <button key={f} onClick={() => setActiveFloor(String(f))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeFloor === String(f) ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                Lantai {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Order list */}
      <div className="px-6 pb-8 space-y-3">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2 animate-spin">⏳</div>
            <p>Memuat order...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">📭</div>
            <p className="font-medium">Tidak ada order</p>
            <p className="text-sm mt-1">
              {activeFilter === 'semua' ? 'Belum ada pesanan masuk' : `Tidak ada order dengan status "${STATUS_CONFIG[activeFilter]?.label}"`}
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onUpdateStatus={(status) => statusMutation.mutate({ id: order.id, status })}
              isUpdating={statusMutation.isPending}
            />
          ))
        )}
      </div>
    </div>
    </StaffLayout>
  );
}

// ─── Komponen OrderCard ───────────────────────────────
function OrderCard({ order, onUpdateStatus, isUpdating }) {
  const [expanded, setExpanded] = useState(true);
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      {/* Header order */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <div className={`w-3 h-3 rounded-full ${cfg.dot} animate-pulse`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800">Order #{order.id}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                {cfg.label}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm text-gray-500">
                Meja {order.table?.number} · Lantai {order.table?.floor} · {formatTime(order.createdAt)}
              </p>
              {order.orderType === 'take-away' ? (
                <span className="text-xs bg-purple-100 text-purple-600 border border-purple-200 rounded-full px-2 py-0.5 font-medium">🥡 Take Away</span>
              ) : (
                <span className="text-xs bg-green-50 text-green-600 border border-green-200 rounded-full px-2 py-0.5 font-medium">🪑 Dine In</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-orange-500">{formatRupiah(order.totalAmount)}</p>
          <p className="text-xs text-gray-400">{order.items?.length} item</p>
        </div>
      </div>

      {/* Detail item (expandable) */}
      {expanded && (
        <div className="px-4 pb-4">
          <div className="border-t pt-3 space-y-2 mb-3">
            {order.items?.map((item) => (
              <div key={item.id} className="flex items-start justify-between text-sm">
                <div className="flex-1">
                  <span className="font-medium text-gray-700">
                    {item.quantity}× {item.menu?.name}
                  </span>
                  {item.notes && (
                    <p className="text-xs text-orange-500 mt-0.5">📝 {item.notes}</p>
                  )}
                </div>
                <span className="text-gray-500 ml-2">{formatRupiah(item.price * item.quantity)}</span>
              </div>
            ))}
            {order.notes && (
              <div className="bg-orange-50 rounded-lg px-3 py-2 mt-2">
                <p className="text-xs text-orange-600">📝 Catatan: {order.notes}</p>
              </div>
            )}
          </div>

          {/* Tombol aksi */}
          {cfg.next && (
            <div className="flex gap-2">
              <button
                onClick={() => onUpdateStatus(cfg.next)}
                disabled={isUpdating}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50"
              >
                {cfg.nextLabel}
              </button>
              {order.status === 'pending' && (
                <button
                  onClick={() => onUpdateStatus('cancelled')}
                  disabled={isUpdating}
                  className="px-4 py-2.5 rounded-xl font-semibold text-sm border border-red-200 text-red-500 hover:bg-red-50 transition"
                >
                  Batal
                </button>
              )}
            </div>
          )}

          {order.status === 'done' && (
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <span>✅</span>
              <span>Pesanan selesai — {formatTime(order.updatedAt)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Loading saat cek auth ────────────────────────────
function LoadingAuth() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center text-gray-400">
        <div className="text-4xl mb-3 animate-pulse">🔐</div>
        <p>Memeriksa sesi login...</p>
      </div>
    </div>
  );
}
