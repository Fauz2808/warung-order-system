'use client';
// app/admin/meja/page.js — kelola meja + lihat QR code

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { getTables, createTable, deleteTable } from '@/lib/api';

// Gunakan NEXT_PUBLIC_APP_URL jika ada (production), fallback ke window.location.origin
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

export default function AdminMejaPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQR, setShowQR] = useState(null);
  const qrRef = useRef(null);

  const handleDownloadQR = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;

    // Buat canvas baru dengan padding & label meja
    const padding = 24;
    const labelH  = 48;
    const out = document.createElement('canvas');
    out.width  = canvas.width  + padding * 2;
    out.height = canvas.height + padding * 2 + labelH;

    const ctx = out.getContext('2d');
    // Background putih
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);

    // QR code
    ctx.drawImage(canvas, padding, padding);

    // Label "Meja X — Carra Coffee"
    ctx.fillStyle = '#1C1C1A';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Meja ${showQR.number} · Lantai ${showQR.floor} · Carra Coffee`,
      out.width / 2,
      canvas.height + padding + labelH / 2 + 4,
    );

    const link = document.createElement('a');
    link.download = `qr-meja-${showQR.number}.png`;
    link.href = out.toDataURL('image/png');
    link.click();
    toast.success(`QR Meja ${showQR.number} berhasil didownload!`);
  };
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ number: '', floor: '1' });
  const [filterFloor, setFilterFloor] = useState('semua');

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables-admin'],
    queryFn: getTables,
  });

  const createMutation = useMutation({
    mutationFn: createTable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-admin'] });
      toast.success('Meja berhasil ditambahkan!');
      setShowAddModal(false);
      setForm({ number: '', floor: '1' });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menambahkan meja'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-admin'] });
      toast.success('Meja berhasil dihapus');
      setDeleteConfirm(null);
    },
    onError: () => toast.error('Gagal menghapus meja'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({ number: parseInt(form.number), floor: parseInt(form.floor) });
  };

  const floors = [...new Set(tables.map((t) => t.floor))].sort();
  const filtered = filterFloor === 'semua' ? tables : tables.filter((t) => String(t.floor) === filterFloor);
  const occupied = tables.filter((t) => t.isOccupied).length;

  return (
    <div className="p-6" style={{ backgroundColor: '#F7F7F5', minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1C1C1A' }}>🪑 Kelola Meja</h1>
          <p className="text-sm mt-1" style={{ color: '#6B7560' }}>
            {tables.length} meja · {occupied} sedang terisi · {tables.length - occupied} kosong
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2"
          style={{ backgroundColor: '#658051' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4d6340'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#658051'}
        >
          <span>+</span> Tambah Meja
        </button>
      </div>

      {/* Filter lantai */}
      {floors.length > 1 && (
        <div className="flex gap-2 mb-4">
          {['semua', ...floors.map(String)].map((f) => (
            <button
              key={f}
              onClick={() => setFilterFloor(f)}
              className="px-4 py-1.5 rounded-full text-sm font-medium transition"
              style={
                filterFloor === f
                  ? { backgroundColor: '#658051', color: '#FFFFFF', border: '1px solid #658051' }
                  : { backgroundColor: '#FFFFFF', color: '#6B7560', border: '1px solid #E8ECE4' }
              }
            >
              {f === 'semua' ? 'Semua Lantai' : `Lantai ${f}`}
            </button>
          ))}
        </div>
      )}

      {/* Grid meja */}
      {isLoading ? (
        <div className="text-center py-16" style={{ color: '#9CA38F' }}>Memuat data meja...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#9CA38F' }}>
          <p className="text-4xl mb-2">🪑</p>
          <p>Belum ada meja. Klik &quot;Tambah Meja&quot; untuk mulai.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((table) => (
            <div
              key={table.id}
              className="rounded-2xl shadow-sm p-4 flex flex-col items-center gap-3 transition hover:shadow-md"
              style={
                table.isOccupied
                  ? { backgroundColor: '#EDF1EA', border: '1px solid #c8d8c0' }
                  : { backgroundColor: '#FFFFFF', border: '1px solid #E8ECE4' }
              }
            >
              {/* Status dot */}
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: table.isOccupied ? '#658051' : '#4ade80' }}
              />

              {/* Nomor + lantai */}
              <div className="text-center">
                <p className="text-3xl font-black" style={{ color: '#1C1C1A' }}>{table.number}</p>
                <p className="text-xs" style={{ color: '#9CA38F' }}>Lantai {table.floor}</p>
              </div>

              {/* Status badge */}
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                style={
                  table.isOccupied
                    ? { backgroundColor: '#EDF1EA', color: '#658051' }
                    : { backgroundColor: '#dcfce7', color: '#16a34a' }
                }
              >
                {table.isOccupied ? 'Terisi' : 'Kosong'}
              </span>

              {/* Tombol aksi */}
              <div className="flex gap-1.5 w-full">
                <button
                  onClick={() => setShowQR(table)}
                  className="flex-1 text-xs py-1.5 rounded-lg font-medium transition"
                  style={{ backgroundColor: '#F7F7F5', color: '#6B7560' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E8ECE4'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F7F7F5'}
                >
                  QR
                </button>
                <button
                  onClick={() => setDeleteConfirm(table.id)}
                  className="flex-1 text-xs py-1.5 rounded-lg font-medium transition"
                  style={{ border: '1px solid #FECACA', color: '#DC2626', backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal QR Code */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowQR(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl p-8 text-center max-w-xs w-full">
            <button
              onClick={() => setShowQR(null)}
              className="absolute top-4 right-4 text-xl transition"
              style={{ color: '#9CA38F' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#6B7560'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#9CA38F'}
            >✕</button>

            <p className="text-sm mb-1" style={{ color: '#9CA38F' }}>QR Code</p>
            <h2 className="text-2xl font-black mb-1" style={{ color: '#1C1C1A' }}>Meja {showQR.number}</h2>
            <p className="text-sm mb-6" style={{ color: '#9CA38F' }}>Lantai {showQR.floor}</p>

            {/* QR Code */}
            <div ref={qrRef} className="flex justify-center mb-4 p-4 bg-white rounded-2xl border-2" style={{ borderColor: '#E8ECE4' }}>
              <QRCodeCanvas
                value={`${BASE_URL}/meja/${showQR.id}`}
                size={180}
                level="M"
                includeMargin={false}
              />
            </div>

            <p className="text-xs mb-1" style={{ color: '#9CA38F' }}>URL yang di-encode:</p>
            <p
              className="text-xs font-mono rounded-lg px-3 py-2 break-all mb-4"
              style={{ color: '#658051', backgroundColor: '#EDF1EA' }}
            >
              {BASE_URL}/meja/{showQR.id}
            </p>

            {/* Tombol Download */}
            <button
              onClick={handleDownloadQR}
              className="w-full py-3 rounded-2xl font-semibold text-sm text-white transition flex items-center justify-center gap-2"
              style={{ backgroundColor: '#658051' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4d6340'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#658051'}
            >
              ⬇️ Download QR Code
            </button>
            <p className="text-xs mt-3" style={{ color: '#9CA38F' }}>
              Print dan tempel di meja {showQR.number}
            </p>
          </div>
        </div>
      )}

      {/* Modal Tambah Meja */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#E8ECE4' }}>
              <h2 className="text-lg font-bold" style={{ color: '#1C1C1A' }}>Tambah Meja Baru</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-xl transition"
                style={{ color: '#9CA38F' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#6B7560'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9CA38F'}
              >✕</button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#1C1C1A' }}>Nomor Meja *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  placeholder="contoh: 13"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: '#E8ECE4', color: '#1C1C1A', '--tw-ring-color': '#658051' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#658051'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(101,128,81,0.2)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E8ECE4'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#1C1C1A' }}>Lantai *</label>
                <select
                  value={form.floor}
                  onChange={(e) => setForm({ ...form, floor: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white"
                  style={{ borderColor: '#E8ECE4', color: '#1C1C1A' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#658051'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(101,128,81,0.2)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E8ECE4'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <option value="1">Lantai 1</option>
                  <option value="2">Lantai 2</option>
                  <option value="3">Lantai 3</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition"
                  style={{ border: '1px solid #E8ECE4', color: '#6B7560', backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F7F7F5'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 text-white py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50"
                  style={{ backgroundColor: '#658051' }}
                  onMouseEnter={(e) => !createMutation.isPending && (e.currentTarget.style.backgroundColor = '#4d6340')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#658051')}
                >
                  {createMutation.isPending ? 'Menyimpan...' : 'Tambah Meja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal konfirmasi hapus */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-lg font-bold mb-1" style={{ color: '#1C1C1A' }}>Hapus Meja?</h3>
            <p className="text-sm mb-6" style={{ color: '#6B7560' }}>
              Meja <strong>{tables.find((t) => t.id === deleteConfirm)?.number}</strong> akan dihapus permanen.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition"
                style={{ border: '1px solid #E8ECE4', color: '#6B7560', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F7F7F5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Batal
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
