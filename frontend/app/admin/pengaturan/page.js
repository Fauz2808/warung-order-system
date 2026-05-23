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
    <div className="p-6 max-w-2xl space-y-6" style={{ backgroundColor: '#F7F7F5', minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#1C1C1A' }}>⚙️ Pengaturan</h1>
        <p className="text-sm mt-1" style={{ color: '#6B7560' }}>Atur jam operasional dan status warung</p>
      </div>

      {/* Status card */}
      <div
        className="rounded-2xl border p-5"
        style={
          isCurrentlyOpen
            ? { backgroundColor: '#EDF1EA', borderColor: '#c8d8c0' }
            : { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }
        }
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full animate-pulse"
              style={{ backgroundColor: isCurrentlyOpen ? '#658051' : '#DC2626' }}
            />
            <div>
              <p
                className="font-bold text-lg"
                style={{ color: isCurrentlyOpen ? '#658051' : '#DC2626' }}
              >
                Warung {isCurrentlyOpen ? 'Buka' : 'Tutup'}
              </p>
              <p className="text-sm" style={{ color: '#6B7560' }}>
                {settings?.isForceClose
                  ? 'Ditutup paksa oleh admin'
                  : `Jam operasional: ${settings?.openTime ?? '...'} – ${settings?.closeTime ?? '...'} WIB`}
              </p>
            </div>
          </div>

          {/* Toggle tutup paksa */}
          <div className="text-right">
            <p className="text-xs mb-1.5" style={{ color: '#6B7560' }}>Tutup Paksa</p>
            <button
              onClick={() => toggleForceMutation.mutate(!settings?.isForceClose)}
              disabled={toggleForceMutation.isPending || isLoading}
              className="relative inline-flex h-7 w-14 items-center rounded-full transition disabled:opacity-50"
              style={{ backgroundColor: settings?.isForceClose ? '#DC2626' : '#E8ECE4' }}
            >
              <span
                className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: settings?.isForceClose ? 'translateX(32px)' : 'translateX(4px)' }}
              />
            </button>
          </div>
        </div>

        {settings?.isForceClose && (
          <div className="mt-3 flex items-center gap-2 bg-white/60 rounded-xl px-4 py-2.5">
            <span>⚠️</span>
            <p className="text-sm" style={{ color: '#DC2626' }}>
              Tutup paksa aktif — customer tidak bisa order sampai dimatikan
            </p>
          </div>
        )}
      </div>

      {/* Form jam operasional */}
      <div className="bg-white rounded-2xl shadow-sm p-5" style={{ border: '1px solid #E8ECE4' }}>
        <h2 className="font-bold mb-1" style={{ color: '#1C1C1A' }}>🕐 Jam Operasional</h2>
        <p className="text-xs mb-5" style={{ color: '#9CA38F' }}>
          Customer tidak bisa order di luar jam ini. Semua waktu dalam WIB (GMT+7).
        </p>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#1C1C1A' }}>
                🟢 Jam Buka
              </label>
              <input
                type="time"
                value={form.openTime}
                onChange={(e) => setForm({ ...form, openTime: e.target.value })}
                className="w-full border rounded-xl px-3 py-2.5 text-lg font-semibold focus:outline-none"
                style={{ borderColor: '#E8ECE4', color: '#1C1C1A' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#658051'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(101,128,81,0.2)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#E8ECE4'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#1C1C1A' }}>
                🔴 Jam Tutup
              </label>
              <input
                type="time"
                value={form.closeTime}
                onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
                className="w-full border rounded-xl px-3 py-2.5 text-lg font-semibold focus:outline-none"
                style={{ borderColor: '#E8ECE4', color: '#1C1C1A' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#658051'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(101,128,81,0.2)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#E8ECE4'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
          </div>

          {/* Preview jadwal */}
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm"
            style={{ backgroundColor: '#EDF1EA', color: '#4d6340' }}
          >
            <span>ℹ️</span>
            <span>
              Warung akan buka dari <strong>{form.openTime}</strong> sampai <strong>{form.closeTime}</strong> WIB setiap hari
            </span>
          </div>

          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="w-full text-white py-3 rounded-xl font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: '#658051' }}
            onMouseEnter={(e) => !saveMutation.isPending && (e.currentTarget.style.backgroundColor = '#4d6340')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#658051')}
          >
            {saveMutation.isPending ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Menyimpan...</>
            ) : '💾 Simpan Jam Operasional'}
          </button>
        </form>
      </div>

      {/* Info */}
      <div className="bg-white rounded-2xl shadow-sm p-5" style={{ border: '1px solid #E8ECE4' }}>
        <h2 className="font-bold mb-3" style={{ color: '#1C1C1A' }}>📋 Cara Kerja</h2>
        <ul className="space-y-2 text-sm" style={{ color: '#6B7560' }}>
          <li className="flex gap-2">
            <span>•</span>
            <span>Di luar jam operasional, halaman customer menampilkan pesan <strong style={{ color: '#1C1C1A' }}>&quot;Warung Tutup&quot;</strong></span>
          </li>
          <li className="flex gap-2">
            <span>•</span>
            <span>Customer tidak bisa submit order saat warung tutup</span>
          </li>
          <li className="flex gap-2">
            <span>•</span>
            <span><strong style={{ color: '#1C1C1A' }}>Tutup Paksa</strong> menutup warung kapan saja (berguna saat libur mendadak)</span>
          </li>
          <li className="flex gap-2">
            <span>•</span>
            <span>Semua jam dalam zona waktu <strong style={{ color: '#1C1C1A' }}>WIB (GMT+7)</strong></span>
          </li>
        </ul>
      </div>
    </div>
  );
}
