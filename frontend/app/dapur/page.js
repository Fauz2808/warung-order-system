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
        <div className="bg-yellow-400 text-yellow-900 rounded-2xl px-5 py-3 font-bold shadow-lg flex gap-2 items-center">
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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">
      <p>🔐 Memeriksa sesi...</p>
    </div>
  );

  const allActive = [...orders, ...preparing].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  return (
    <StaffLayout>
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header dapur — gelap, mudah dibaca dari jauh */}
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-between border-b border-gray-700">
        <div>
          <h1 className="text-2xl font-bold">👨‍🍳 Dapur</h1>
          <p className="text-gray-400 text-sm">Order aktif yang perlu disiapkan</p>
        </div>
        <div className="flex gap-4 text-center">
          <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl px-4 py-2">
            <p className="text-2xl font-bold text-yellow-400">{orders.length}</p>
            <p className="text-xs text-yellow-300">Menunggu</p>
          </div>
          <div className="bg-blue-500/20 border border-blue-500/30 rounded-xl px-4 py-2">
            <p className="text-2xl font-bold text-blue-400">{preparing.length}</p>
            <p className="text-xs text-blue-300">Diproses</p>
          </div>
        </div>
      </div>

      {/* Order grid */}
      <div className="p-6">
        {isLoading ? (
          <div className="text-center py-20 text-gray-500">
            <div className="text-5xl mb-3">⏳</div>
            <p>Memuat order...</p>
          </div>
        ) : allActive.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-xl font-semibold">Semua order selesai!</p>
            <p className="text-sm mt-1">Tidak ada order yang perlu disiapkan</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allActive.map((order) => {
              const menit = minutesSince(order.createdAt);
              const isLate = menit > 15; // lebih dari 15 menit — highlight merah
              const isPending = order.status === 'pending';

              return (
                <div
                  key={order.id}
                  className={`rounded-2xl p-5 border ${
                    isLate
                      ? 'bg-red-900/40 border-red-500/50'
                      : isPending
                      ? 'bg-yellow-900/30 border-yellow-500/40'
                      : 'bg-blue-900/30 border-blue-500/40'
                  }`}
                >
                  {/* Header card */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black">Meja {order.table?.number}</span>
                        {isLate && <span className="text-xs bg-red-500 px-2 py-0.5 rounded-full font-bold animate-pulse">LAMA!</span>}
                      </div>
                      <p className="text-sm text-gray-400">Lantai {order.table?.floor} · #{order.id}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-black ${isLate ? 'text-red-400' : 'text-gray-300'}`}>
                        {menit}m
                      </p>
                      <p className="text-xs text-gray-500">{formatTime(order.createdAt)}</p>
                    </div>
                  </div>

                  {/* List item yang harus dimasak */}
                  <div className="space-y-2 mb-4">
                    {order.items?.map((item) => (
                      <div key={item.id} className="flex items-start gap-2">
                        <span className="bg-white/10 rounded-lg px-2 py-0.5 text-sm font-bold min-w-[28px] text-center">
                          {item.quantity}×
                        </span>
                        <div>
                          <p className="font-semibold text-white">{item.menu?.name}</p>
                          {item.notes && (
                            <p className="text-xs text-yellow-300 mt-0.5">⚠️ {item.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {order.notes && (
                      <div className="bg-white/5 rounded-lg px-3 py-2 mt-2">
                        <p className="text-xs text-gray-300">📝 {order.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Tombol aksi */}
                  {isPending ? (
                    <button
                      onClick={() => statusMutation.mutate({ id: order.id, status: 'preparing' })}
                      disabled={statusMutation.isPending}
                      className="w-full bg-yellow-500 hover:bg-yellow-400 text-yellow-900 font-bold py-2.5 rounded-xl transition text-sm"
                    >
                      Mulai Masak ▶
                    </button>
                  ) : (
                    <button
                      onClick={() => statusMutation.mutate({ id: order.id, status: 'ready' })}
                      disabled={statusMutation.isPending}
                      className="w-full bg-green-500 hover:bg-green-400 text-white font-bold py-2.5 rounded-xl transition text-sm"
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
