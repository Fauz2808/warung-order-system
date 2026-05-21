'use client';
// app/admin/meja/page.js — kelola meja + lihat QR code

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { getTables, createTable, deleteTable } from '@/lib/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(':3000', ':3001') || 'http://localhost:3001';

export default function AdminMejaPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQR, setShowQR] = useState(null);   // data meja yang QR-nya ditampilkan
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
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🪑 Kelola Meja</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tables.length} meja · {occupied} sedang terisi · {tables.length - occupied} kosong
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2">
          <span>+</span> Tambah Meja
        </button>
      </div>

      {/* Filter lantai */}
      {floors.length > 1 && (
        <div className="flex gap-2 mb-4">
          {['semua', ...floors.map(String)].map((f) => (
            <button key={f} onClick={() => setFilterFloor(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                filterFloor === f ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
              }`}>
              {f === 'semua' ? 'Semua Lantai' : `Lantai ${f}`}
            </button>
          ))}
        </div>
      )}

      {/* Grid meja */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Memuat data meja...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-2">🪑</p>
          <p>Belum ada meja. Klik &quot;Tambah Meja&quot; untuk mulai.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((table) => (
            <div key={table.id}
              className={`bg-white rounded-2xl border shadow-sm p-4 flex flex-col items-center gap-3 transition hover:shadow-md ${
                table.isOccupied ? 'border-orange-200 bg-orange-50' : ''
              }`}>
              {/* Status dot */}
              <div className={`w-2.5 h-2.5 rounded-full ${table.isOccupied ? 'bg-orange-400' : 'bg-green-400'}`} />

              {/* Nomor + lantai */}
              <div className="text-center">
                <p className="text-3xl font-black text-gray-800">{table.number}</p>
                <p className="text-xs text-gray-400">Lantai {table.floor}</p>
              </div>

              {/* Status badge */}
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                table.isOccupied ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
              }`}>
                {table.isOccupied ? 'Terisi' : 'Kosong'}
              </span>

              {/* Tombol aksi */}
              <div className="flex gap-1.5 w-full">
                <button onClick={() => setShowQR(table)}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium transition">
                  QR
                </button>
                <button onClick={() => setDeleteConfirm(table.id)}
                  className="flex-1 text-xs py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-500 font-medium transition">
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
            <button onClick={() => setShowQR(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl">✕</button>

            <p className="text-sm text-gray-400 mb-1">QR Code</p>
            <h2 className="text-2xl font-black text-gray-800 mb-1">Meja {showQR.number}</h2>
            <p className="text-sm text-gray-400 mb-6">Lantai {showQR.floor}</p>

            {/* QR Code */}
            <div className="flex justify-center mb-4 p-4 bg-white rounded-2xl border-2 border-gray-100">
              <QRCodeSVG
                value={`${BASE_URL}/meja/${showQR.id}`}
                size={180}
                level="M"
                includeMargin={false}
              />
            </div>

            <p className="text-xs text-gray-400 mb-1">URL yang di-encode:</p>
            <p className="text-xs text-orange-500 font-mono bg-orange-50 rounded-lg px-3 py-2 break-all">
              {BASE_URL}/meja/{showQR.id}
            </p>

            <p className="text-xs text-gray-400 mt-4">
              Screenshot atau print QR ini dan tempel di meja {showQR.number}
            </p>
          </div>
        </div>
      )}

      {/* Modal Tambah Meja */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-800">Tambah Meja Baru</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Meja *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  placeholder="contoh: 13"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lantai *</label>
                <select
                  value={form.floor}
                  onChange={(e) => setForm({ ...form, floor: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                >
                  <option value="1">Lantai 1</option>
                  <option value="2">Lantai 2</option>
                  <option value="3">Lantai 3</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-50 transition">
                  Batal
                </button>
                <button type="submit" disabled={createMutation.isPending}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50">
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
            <h3 className="text-lg font-bold text-gray-800 mb-1">Hapus Meja?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Meja <strong>{tables.find((t) => t.id === deleteConfirm)?.number}</strong> akan dihapus permanen.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-50 transition">
                Batal
              </button>
              <button onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50">
                {deleteMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
