'use client';
// app/dapur/page.js
// Tampilan khusus dapur — fokus ke order yang perlu dimasak

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getOrders, updateOrderStatus } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/hooks/useAuth';
import StaffLayout from '@/components/StaffLayout';

const formatTime = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

// Hitung berapa menit sejak order dibuat
const minutesSince = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 60000);
};

export default function DapurPage() {
  const { loading } = useAuth();
  const queryClient = useQueryClient();

  // Semua hooks harus dipanggil sebelum early return
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders-dapur'],
    queryFn: () => getOrders({ status: 'pending' }),
    refetchInterval: 20000,
    enabled: !loading,
  });

  const { data: preparing = [] } = useQuery({
    queryKey: ['orders-preparing'],
    queryFn: () => getOrders({ status: 'preparing' }),
    refetchInterval: 20000,
    enabled: !loading,
  });

  // Socket.IO
  useEffect(() => {
    if (loading) return;
    const socket = getSocket();
    socket.connect();

    socket.on('order:new', (newOrder) => {
      queryClient.invalidateQueries({ queryKey: ['orders-dapur'] });
      // Bunyi notif untuk dapur
      toast.custom(() => (
        <div className="rounded-2xl px-5 py-3 font-bold shadow-lg flex gap-2 items-center"
          style={{ background: '#658051', color: '#ffffff' }}>
          <span className="text-xl">🔔</span>
          <span>Order baru! Meja {newOrder.table?.number}</span>
        </div>
      ), { duration: 5000 });
    });

    socket.on('order:status_update', () => {
      queryClient.invalidateQueries({ queryKey: ['orders-dapur'] });
      queryClient.invalidateQueries({ queryKey: ['orders-preparing'] });
    });

    return () => {
      socket.off('order:new');
      socket.off('order:status_update');
      socket.disconnect();
    };
  }, [queryClient, loading]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateOrderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-dapur'] });
      queryClient.invalidateQueries({ queryKey: ['orders-preparing'] });
    },
    onError: () => toast.error('Gagal update status'),
  });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#111714', color: '#9CA38F' }}>
      <p>🔐 Memeriksa sesi...</p>
    </div>
  );

  const allActive = [...orders, ...preparing].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  return (
    <StaffLayout>
    <div className="min-h-screen text-white" style={{ background: '#111714' }}>
      {/* Header dapur — gelap, mudah dibaca dari jauh */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b"
        style={{ background: '#1a2118', borderColor: '#2d3d29' }}>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">👨‍🍳 Dapur</h1>
          <p className="text-xs sm:text-sm" style={{ color: '#6B7560' }}>Order aktif yang perlu disiapkan</p>
        </div>
        <div className="flex gap-2 sm:gap-4 text-center">
          <div className="rounded-xl px-3 sm:px-4 py-2 border"
            style={{ background: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.25)' }}>
            <p className="text-xl sm:text-2xl font-bold text-amber-400">{orders.length}</p>
            <p className="text-xs text-amber-300">Menunggu</p>
          </div>
          <div className="rounded-xl px-3 sm:px-4 py-2 border"
            style={{ background: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.25)' }}>
            <p className="text-xl sm:text-2xl font-bold text-blue-400">{preparing.length}</p>
            <p className="text-xs text-blue-300">Diproses</p>
          </div>
        </div>
      </div>

      {/* Order grid */}
      <div className="p-3 sm:p-6">
        {isLoading ? (
          <div className="text-center py-20" style={{ color: '#6B7560' }}>
            <div className="text-5xl mb-3">⏳</div>
            <p>Memuat order...</p>
          </div>
        ) : allActive.length === 0 ? (
          <div className="text-center py-20" style={{ color: '#6B7560' }}>
            <div className="text-6xl mb-4">✅</div>
            <p className="text-xl font-semibold text-white">Semua order selesai!</p>
            <p className="text-sm mt-1">Tidak ada order yang perlu disiapkan</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allActive.map((order) => {
              const menit = minutesSince(order.createdAt);
              const isLate = menit > 15; // lebih dari 15 menit — highlight merah
              const isPending = order.status === 'pending';

              // Card background & border berdasarkan state
              const cardStyle = isLate
                ? { background: '#2d1515', border: '1px solid #7f2c2c' }
                : isPending
                ? { background: '#1f2b1c', border: '1px solid #3d5c38' }
                : { background: '#192030', border: '1px solid #2d4a6b' };

              return (
                <div
                  key={order.id}
                  className="rounded-2xl p-5"
                  style={cardStyle}
                >
                  {/* Header card */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-white">Meja {order.table?.number}</span>
                        {isLate && (
                          <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                            LAMA!
                          </span>
                        )}
                      </div>
                      <p className="text-sm" style={{ color: '#6B7560' }}>
                        Lantai {order.table?.floor} · #{order.id}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-black ${isLate ? 'text-red-400' : 'text-gray-300'}`}>
                        {menit}m
                      </p>
                      <p className="text-xs" style={{ color: '#6B7560' }}>{formatTime(order.createdAt)}</p>
                    </div>
                  </div>

                  {/* List item yang harus dimasak */}
                  <div className="space-y-2 mb-4">
                    {order.items?.map((item) => (
                      <div key={item.id} className="flex items-start gap-2">
                        <span className="rounded-lg px-2 py-0.5 text-sm font-bold min-w-[28px] text-center text-white"
                          style={{ background: 'rgba(255,255,255,0.1)' }}>
                          {item.quantity}×
                        </span>
                        <div>
                          <p className="font-semibold text-white">{item.menu?.name}</p>
                          {item.notes && (
                            <p className="text-xs text-amber-300 mt-0.5">⚠️ {item.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {order.notes && (
                      <div className="rounded-lg px-3 py-2 mt-2"
                        style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <p className="text-xs text-gray-300">📝 {order.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Tombol aksi */}
                  {isPending ? (
                    <button
                      onClick={() => statusMutation.mutate({ id: order.id, status: 'preparing' })}
                      disabled={statusMutation.isPending}
                      className="w-full text-white font-bold py-2.5 rounded-xl transition text-sm disabled:opacity-50"
                      style={{ background: '#658051' }}
                      onMouseEnter={(e) => { if (!statusMutation.isPending) e.currentTarget.style.background = '#4d6340'; }}
                      onMouseLeave={(e) => { if (!statusMutation.isPending) e.currentTarget.style.background = '#658051'; }}
                    >
                      Mulai Masak ▶
                    </button>
                  ) : (
                    <button
                      onClick={() => statusMutation.mutate({ id: order.id, status: 'ready' })}
                      disabled={statusMutation.isPending}
                      className="w-full bg-green-500 hover:bg-green-400 text-white font-bold py-2.5 rounded-xl transition text-sm disabled:opacity-50"
                    >
                      Siap Diantar ✓
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </StaffLayout>
  );
}
