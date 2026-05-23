'use client';
// app/admin/pengaturan/page.js — Pengaturan jam operasional warung

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getSettings, updateSettings } from '@/lib/api';

export default function PengaturanPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ openTime: '08:00', closeTime: '22:00', isForceClose: false });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  // Sync form saat data load
  useEffect(() => {
    if (settings) {
      setForm({
        openTime:     settings.openTime,
        closeTime:    settings.closeTime,
        isForceClose: settings.isForceClose,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Pengaturan berhasil disimpan!');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menyimpan'),
  });

  // Toggle tutup paksa langsung (tanpa klik Save)
  const toggleForceMutation = useMutation({
    mutationFn: (isForceClose) => updateSettings({ isForceClose }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(res.data.isForceClose ? '🔴 Warung ditutup paksa' : '🟢 Warung dibuka kembali');
    },
    onError: () => toast.error('Gagal mengubah status'),
  });

  const handleSave = (e) => {
    e.preventDefault();
    saveMutation.mutate({ openTime: form.openTime, closeTime: form.closeTime });
  };

  // Status badge
  const isCurrentlyOpen = settings?.isOpen;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">⚙️ Pengaturan</h1>
        <p className="text-sm text-gray-500 mt-1">Atur jam operasional dan status warung</p>
      </div>

      {/* Status card */}
      <div className={`rounded-2xl border p-5 ${isCurrentlyOpen ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${isCurrentlyOpen ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
            <div>
              <p className={`font-bold text-lg ${isCurrentlyOpen ? 'text-green-700' : 'text-red-700'}`}>
                Warung {isCurrentlyOpen ? 'Buka' : 'Tutup'}
              </p>
              <p className="text-sm text-gray-500">
                {settings?.isForceClose
                  ? 'Ditutup paksa oleh admin'
                  : `Jam operasional: ${settings?.openTime ?? '...'} – ${settings?.closeTime ?? '...'} WIB`}
              </p>
            </div>
          </div>

          {/* Toggle tutup paksa */}
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1.5">Tutup Paksa</p>
            <button
              onClick={() => toggleForceMutation.mutate(!settings?.isForceClose)}
              disabled={toggleForceMutation.isPending || isLoading}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition ${
                settings?.isForceClose ? 'bg-red-500' : 'bg-gray-300'
              } disabled:opacity-50`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings?.isForceClose ? 'translate-x-8' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>

        {settings?.isForceClose && (
          <div className="mt-3 flex items-center gap-2 bg-white/60 rounded-xl px-4 py-2.5">
            <span>⚠️</span>
            <p className="text-sm text-red-700">
              Tutup paksa aktif — customer tidak bisa order sampai dimatikan
            </p>
          </div>
        )}
      </div>

      {/* Form jam operasional */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-1">🕐 Jam Operasional</h2>
        <p className="text-xs text-gray-400 mb-5">
          Customer tidak bisa order di luar jam ini. Semua waktu dalam WIB (GMT+7).
        </p>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                🟢 Jam Buka
              </label>
              <input
                type="time"
                value={form.openTime}
                onChange={(e) => setForm({ ...form, openTime: e.target.value })}
                className="w-full border rounded-xl px-3 py-2.5 text-lg font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                🔴 Jam Tutup
              </label>
              <input
                type="time"
                value={form.closeTime}
                onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
                className="w-full border rounded-xl px-3 py-2.5 text-lg font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>

          {/* Preview jadwal */}
          <div className="bg-orange-50 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-orange-700">
            <span>ℹ️</span>
            <span>
              Warung akan buka dari <strong>{form.openTime}</strong> sampai <strong>{form.closeTime}</strong> WIB setiap hari
            </span>
          </div>

          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saveMutation.isPending ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Menyimpan...</>
            ) : '💾 Simpan Jam Operasional'}
          </button>
        </form>
      </div>

      {/* Info */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-3">📋 Cara Kerja</h2>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex gap-2"><span>•</span> <span>Di luar jam operasional, halaman customer menampilkan pesan <strong>"Warung Tutup"</strong></span></li>
          <li className="flex gap-2"><span>•</span> <span>Customer tidak bisa submit order saat warung tutup</span></li>
          <li className="flex gap-2"><span>•</span> <span><strong>Tutup Paksa</strong> menutup warung kapan saja (berguna saat libur mendadak)</span></li>
          <li className="flex gap-2"><span>•</span> <span>Semua jam dalam zona waktu <strong>WIB (GMT+7)</strong></span></li>
        </ul>
      </div>
    </div>
  );
}
