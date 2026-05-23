'use client';
// app/admin/menu/page.js — CRUD menu

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getMenu, createMenu, updateMenu, deleteMenu, uploadMenuImage, deleteMenuImage, adjustStock } from '@/lib/api';

const formatRupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

// Semua kategori Carra Coffee
const CATEGORIES = [
  { value: 'signature',   label: 'Signature',   emoji: '⭐', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'coffee',      label: 'Coffee',       emoji: '☕', color: 'bg-amber-100 text-amber-700' },
  { value: 'americano',   label: 'Americano',    emoji: '🫖', color: 'bg-orange-100 text-orange-700' },
  { value: 'slow-bar',    label: 'Slow Bar',     emoji: '🔬', color: 'bg-purple-100 text-purple-700' },
  { value: 'non-coffee',  label: 'Non Coffee',   emoji: '🧋', color: 'bg-green-100 text-green-700' },
  { value: 'foods',       label: 'Foods',        emoji: '🍟', color: 'bg-red-100 text-red-700' },
  { value: 'additional',  label: 'Extra Shot',   emoji: '➕', color: 'bg-gray-100 text-gray-700' },
];

const getCategoryInfo = (value) =>
  CATEGORIES.find((c) => c.value === value) || { label: value, emoji: '🍽️', color: 'bg-gray-100 text-gray-600' };

const EMPTY_FORM = {
  name: '', description: '', price: '', category: 'signature', isAvailable: true, stock: '',
};

export default function AdminMenuPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterCat, setFilterCat] = useState('semua');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [uploadTarget, setUploadTarget] = useState(null);

  // State untuk gambar di form Tambah/Edit
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

  const { data: menu = [], isLoading } = useQuery({
    queryKey: ['menu-admin'],
    queryFn: getMenu,
  });

  // Tambah menu baru
  const createMutation = useMutation({
    mutationFn: createMenu,
    onSuccess: async (res) => {
      // Kalau ada file yang dipilih, upload dulu sebelum tutup modal
      if (imageFile && res.data?.id) {
        try {
          await uploadMenuImage(res.data.id, imageFile);
        } catch {
          toast.error('Menu tersimpan, tapi foto gagal diupload. Coba upload via tombol foto.');
        }
      }
      queryClient.invalidateQueries({ queryKey: ['menu-admin'] });
      toast.success('Menu berhasil ditambahkan!');
      closeModal();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menambahkan menu'),
  });

  // Edit menu
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateMenu(id, data),
    onSuccess: async (_, { id }) => {
      if (imageFile) {
        try {
          await uploadMenuImage(id, imageFile);
        } catch {
          toast.error('Menu tersimpan, tapi foto gagal diupload. Coba upload via tombol foto.');
        }
      }
      queryClient.invalidateQueries({ queryKey: ['menu-admin'] });
      toast.success('Menu berhasil diperbarui!');
      closeModal();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal memperbarui menu'),
  });

  // Hapus menu
  const deleteMutation = useMutation({
    mutationFn: deleteMenu,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-admin'] });
      toast.success('Menu berhasil dihapus');
      setDeleteConfirm(null);
    },
    onError: () => toast.error('Gagal menghapus menu'),
  });

  // Toggle ketersediaan
  const toggleMutation = useMutation({
    mutationFn: ({ id, isAvailable }) => updateMenu(id, { isAvailable }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-admin'] }),
    onError: () => toast.error('Gagal mengubah ketersediaan'),
  });

  // Adjust stok (+/-)
  const stockMutation = useMutation({
    mutationFn: ({ id, delta }) => adjustStock(id, { delta }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['menu-admin'] });
      toast.success(`Stok: ${res.data.stock ?? '∞'}`);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal update stok'),
  });

  // Set stok langsung (dari input)
  const setStockMutation = useMutation({
    mutationFn: ({ id, stock }) => adjustStock(id, { stock }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-admin'] }),
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal set stok'),
  });

  // Upload foto (dari modal foto terpisah)
  const uploadMutation = useMutation({
    mutationFn: ({ id, file }) => uploadMenuImage(id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-admin'] });
      toast.success('Foto berhasil diupload!');
      setUploadTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal upload foto'),
  });

  // Hapus foto
  const deleteImageMutation = useMutation({
    mutationFn: deleteMenuImage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-admin'] });
      toast.success('Foto berhasil dihapus');
      setUploadTarget(null);
    },
    onError: () => toast.error('Gagal menghapus foto'),
  });

  const openAdd = () => {
    setEditData(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview(null);
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditData(item);
    setForm({
      name: item.name,
      description: item.description || '',
      price: String(item.price),
      category: item.category,
      isAvailable: item.isAvailable,
      stock: item.stock !== null && item.stock !== undefined ? String(item.stock) : '',
    });
    setImageFile(null);
    setImagePreview(item.imageUrl || null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditData(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview(null);
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: parseInt(form.price),
      stock: form.stock === '' ? null : parseInt(form.stock),
    };
    if (editData) {
      updateMutation.mutate({ id: editData.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filtered = filterCat === 'semua' ? menu : menu.filter((m) => m.category === filterCat);

  // Hitung per kategori untuk badge
  const counts = CATEGORIES.reduce((acc, c) => {
    acc[c.value] = menu.filter((m) => m.category === c.value).length;
    return acc;
  }, {});

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6" style={{ backgroundColor: '#F7F7F5', minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1C1C1A' }}>🍽️ Kelola Menu</h1>
          <p className="text-sm mt-1" style={{ color: '#6B7560' }}>
            {menu.length} menu ·{' '}
            {CATEGORIES.filter((c) => counts[c.value] > 0).map((c) => `${counts[c.value]} ${c.label.toLowerCase()}`).join(' · ')}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2"
          style={{ backgroundColor: '#658051' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4d6340'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#658051'}
        >
          <span>+</span> Tambah Menu
        </button>
      </div>

      {/* Filter kategori */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilterCat('semua')}
          className="px-4 py-1.5 rounded-full text-sm font-medium transition"
          style={
            filterCat === 'semua'
              ? { backgroundColor: '#658051', color: '#FFFFFF', border: '1px solid #658051' }
              : { backgroundColor: '#FFFFFF', color: '#6B7560', border: '1px solid #E8ECE4' }
          }
        >
          Semua ({menu.length})
        </button>
        {CATEGORIES.map((cat) => (
          counts[cat.value] > 0 && (
            <button
              key={cat.value}
              onClick={() => setFilterCat(cat.value)}
              className="px-4 py-1.5 rounded-full text-sm font-medium transition"
              style={
                filterCat === cat.value
                  ? { backgroundColor: '#658051', color: '#FFFFFF', border: '1px solid #658051' }
                  : { backgroundColor: '#FFFFFF', color: '#6B7560', border: '1px solid #E8ECE4' }
              }
            >
              {cat.emoji} {cat.label} ({counts[cat.value]})
            </button>
          )
        ))}
      </div>

      {/* Tabel menu */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden overflow-x-auto" style={{ border: '1px solid #E8ECE4' }}>
        {isLoading ? (
          <div className="p-10 text-center" style={{ color: '#9CA38F' }}>Memuat menu...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center" style={{ color: '#9CA38F' }}>
            <p className="text-4xl mb-2">🍽️</p>
            <p>Belum ada menu. Klik &quot;Tambah Menu&quot; untuk mulai.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b" style={{ backgroundColor: '#F7F7F5', borderColor: '#E8ECE4' }}>
              <tr>
                <th className="text-left px-4 py-3 font-semibold w-14" style={{ color: '#6B7560' }}>Foto</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: '#6B7560' }}>Nama Menu</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: '#6B7560' }}>Kategori</th>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: '#6B7560' }}>Harga</th>
                <th className="text-center px-4 py-3 font-semibold" style={{ color: '#6B7560' }}>Stok</th>
                <th className="text-center px-4 py-3 font-semibold" style={{ color: '#6B7560' }}>Tersedia</th>
                <th className="text-center px-4 py-3 font-semibold" style={{ color: '#6B7560' }}>Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: '#E8ECE4' }}>
              {filtered.map((item) => {
                const catInfo = getCategoryInfo(item.category);
                return (
                  <tr
                    key={item.id}
                    className="transition"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FAFAF8'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FFFFFF'}
                  >
                    {/* Kolom foto — klik untuk upload */}
                    <td className="px-4 py-3">
                      <div
                        className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-80 transition relative group"
                        style={{ backgroundColor: '#EDF1EA', border: '1px solid #E8ECE4' }}
                        onClick={() => setUploadTarget(item)}
                        title="Klik untuk upload/ganti foto"
                      >
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg">{catInfo.emoji}</span>
                        )}
                        {/* Overlay edit icon */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-xl">
                          <span className="text-white text-xs">📷</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: '#1C1C1A' }}>{item.name}</p>
                      {item.description && (
                        <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: '#9CA38F' }}>{item.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${catInfo.color}`}>
                        {catInfo.emoji} {catInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: '#1C1C1A' }}>
                      {formatRupiah(item.price)}
                    </td>
                    {/* Kolom stok */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => stockMutation.mutate({ id: item.id, delta: -1 })}
                          disabled={item.stock === null || item.stock === 0}
                          className="w-6 h-6 rounded-lg font-bold text-sm flex items-center justify-center transition disabled:opacity-30"
                          style={{ backgroundColor: '#EDF1EA', color: '#658051' }}
                          onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#c8d8c0')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#EDF1EA')}
                        >−</button>
                        <span className={`w-10 text-center text-sm font-semibold ${
                          item.stock === null ? '' :
                          item.stock === 0    ? 'text-red-500' :
                          item.stock <= 5     ? 'text-amber-500' : ''
                        }`}
                        style={item.stock === null ? { color: '#9CA38F' } : item.stock > 5 ? { color: '#1C1C1A' } : {}}>
                          {item.stock === null ? '∞' : item.stock}
                        </span>
                        <button
                          onClick={() => stockMutation.mutate({ id: item.id, delta: +1 })}
                          className="w-6 h-6 rounded-lg font-bold text-sm flex items-center justify-center transition"
                          style={{ backgroundColor: '#EDF1EA', color: '#658051' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#c8d8c0'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#EDF1EA'}
                        >+</button>
                      </div>
                      {item.stock !== null && item.stock === 0 && (
                        <p className="text-center text-xs text-red-500 mt-0.5">Habis</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleMutation.mutate({ id: item.id, isAvailable: !item.isAvailable })}
                        className="relative inline-flex h-6 w-11 items-center rounded-full transition"
                        style={{ backgroundColor: item.isAvailable ? '#658051' : '#E8ECE4' }}
                      >
                        <span
                          className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                          style={{ transform: item.isAvailable ? 'translateX(24px)' : 'translateX(4px)' }}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(item)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium transition"
                          style={{ border: '1px solid #E8ECE4', color: '#658051', backgroundColor: 'transparent' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#EDF1EA'; e.currentTarget.style.borderColor = '#c8d8c0'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#E8ECE4'; }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(item.id)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium transition"
                          style={{ border: '1px solid #FECACA', color: '#DC2626', backgroundColor: 'transparent' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal Tambah / Edit ─────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div
              className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10"
              style={{ borderColor: '#E8ECE4' }}
            >
              <h2 className="text-lg font-bold" style={{ color: '#1C1C1A' }}>
                {editData ? 'Edit Menu' : 'Tambah Menu Baru'}
              </h2>
              <button
                onClick={closeModal}
                className="text-xl transition"
                style={{ color: '#9CA38F' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#6B7560'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9CA38F'}
              >✕</button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

              {/* ── Upload Foto ── */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#1C1C1A' }}>Foto Menu</label>
                <div className="flex items-start gap-4">
                  {/* Preview */}
                  <div
                    className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-dashed flex items-center justify-center flex-shrink-0 cursor-pointer transition"
                    style={{ backgroundColor: '#EDF1EA', borderColor: '#c8d8c0' }}
                    onClick={() => fileInputRef.current?.click()}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#658051'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#c8d8c0'}
                  >
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center p-2" style={{ color: '#9CA38F' }}>
                        <p className="text-3xl">📷</p>
                        <p className="text-xs mt-1">Pilih foto</p>
                      </div>
                    )}
                  </div>

                  {/* Info & tombol */}
                  <div className="flex-1 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm px-3 py-2 rounded-xl font-medium w-full transition"
                      style={{ border: '1px solid #c8d8c0', color: '#658051', backgroundColor: 'transparent' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#EDF1EA'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {imagePreview ? '🔄 Ganti Foto' : '📁 Pilih Foto'}
                    </button>
                    <p className="text-xs mt-2" style={{ color: '#9CA38F' }}>JPG, PNG, WebP · Maks 5MB</p>
                    {imageFile && (
                      <p className="text-xs text-green-600 mt-1 truncate">✓ {imageFile.name}</p>
                    )}
                    {imagePreview && !imageFile && editData?.imageUrl && (
                      <button
                        type="button"
                        onClick={() => { setImagePreview(null); setImageFile(null); }}
                        className="text-xs mt-1 underline"
                        style={{ color: '#DC2626' }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                      >
                        Hapus foto
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleImageChange}
                />
                {!editData && (
                  <p className="text-xs mt-1.5" style={{ color: '#9CA38F' }}>
                    💡 Foto bisa juga diupload nanti dengan klik ikon gambar di tabel
                  </p>
                )}
              </div>

              {/* Nama */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#1C1C1A' }}>Nama Menu *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="contoh: Kopi Susu Carra"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  style={{ borderColor: '#E8ECE4', color: '#1C1C1A' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#658051'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(101,128,81,0.2)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E8ECE4'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>

              {/* Deskripsi */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#1C1C1A' }}>Deskripsi</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Opsional — deskripsi singkat menu"
                  rows={2}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
                  style={{ borderColor: '#E8ECE4', color: '#1C1C1A' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#658051'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(101,128,81,0.2)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E8ECE4'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>

              {/* Harga + Kategori */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#1C1C1A' }}>Harga (Rp) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="25000"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                    style={{ borderColor: '#E8ECE4', color: '#1C1C1A' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#658051'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(101,128,81,0.2)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#E8ECE4'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#1C1C1A' }}>Kategori *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white"
                    style={{ borderColor: '#E8ECE4', color: '#1C1C1A' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#658051'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(101,128,81,0.2)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#E8ECE4'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stok */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#1C1C1A' }}>
                  Stok
                  <span className="text-xs font-normal ml-1" style={{ color: '#6B7560' }}>(kosongkan = unlimited ∞)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    placeholder="∞ Unlimited"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                    style={{ borderColor: '#E8ECE4', color: '#1C1C1A' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#658051'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(101,128,81,0.2)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#E8ECE4'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  {form.stock !== '' && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, stock: '' })}
                      className="text-xs whitespace-nowrap transition"
                      style={{ color: '#9CA38F' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#6B7560'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#9CA38F'}
                    >
                      Reset ∞
                    </button>
                  )}
                </div>
                <p className="text-xs mt-1" style={{ color: '#9CA38F' }}>
                  💡 Stok 0 = menu otomatis ditandai tidak tersedia
                </p>
              </div>

              {/* Toggle tersedia */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium" style={{ color: '#1C1C1A' }}>Tersedia</p>
                  <p className="text-xs" style={{ color: '#9CA38F' }}>Menu akan tampil di halaman customer</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, isAvailable: !form.isAvailable })}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition"
                  style={{ backgroundColor: form.isAvailable ? '#658051' : '#E8ECE4' }}
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: form.isAvailable ? 'translateX(24px)' : 'translateX(4px)' }}
                  />
                </button>
              </div>

              {/* Tombol */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition"
                  style={{ border: '1px solid #E8ECE4', color: '#6B7560', backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F7F7F5'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 text-white py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50"
                  style={{ backgroundColor: '#658051' }}
                  onMouseEnter={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#4d6340')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#658051')}
                >
                  {isSaving ? 'Menyimpan...' : editData ? 'Simpan Perubahan' : 'Tambah Menu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal konfirmasi hapus ──────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-lg font-bold mb-1" style={{ color: '#1C1C1A' }}>Hapus Menu?</h3>
            <p className="text-sm mb-6" style={{ color: '#6B7560' }}>
              Menu <strong>{menu.find((m) => m.id === deleteConfirm)?.name}</strong> akan dihapus permanen.
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

      {/* ── Modal Upload Foto (via klik foto di tabel) ──── */}
      {uploadTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setUploadTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: '#1C1C1A' }}>📷 Foto Menu</h2>
              <button
                onClick={() => setUploadTarget(null)}
                className="text-xl transition"
                style={{ color: '#9CA38F' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#6B7560'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9CA38F'}
              >✕</button>
            </div>

            {/* Preview */}
            <div className="flex justify-center mb-4">
              <div
                className="w-32 h-32 rounded-2xl overflow-hidden border-2 border-dashed flex items-center justify-center"
                style={{ backgroundColor: '#EDF1EA', borderColor: '#c8d8c0' }}
              >
                {uploadTarget.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploadTarget.imageUrl} alt={uploadTarget.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center" style={{ color: '#9CA38F' }}>
                    <p className="text-4xl">{getCategoryInfo(uploadTarget.category).emoji}</p>
                    <p className="text-xs mt-1">Belum ada foto</p>
                  </div>
                )}
              </div>
            </div>

            <p className="text-center text-sm font-medium mb-4" style={{ color: '#1C1C1A' }}>{uploadTarget.name}</p>

            {/* Input file */}
            <label className="block w-full cursor-pointer">
              <div
                className="border-2 border-dashed rounded-xl p-4 text-center transition"
                style={{ borderColor: '#E8ECE4' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#658051'; e.currentTarget.style.backgroundColor = '#EDF1EA'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E8ECE4'; e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <p className="text-2xl mb-1">📁</p>
                <p className="text-sm font-medium" style={{ color: '#6B7560' }}>Klik untuk pilih foto</p>
                <p className="text-xs mt-0.5" style={{ color: '#9CA38F' }}>JPG, PNG, WebP · Maks 5MB</p>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadMutation.mutate({ id: uploadTarget.id, file });
                }}
              />
            </label>

            {uploadMutation.isPending && (
              <div className="mt-3 flex items-center justify-center gap-2 text-sm" style={{ color: '#658051' }}>
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#658051', borderTopColor: 'transparent' }} />
                <span>Mengupload foto...</span>
              </div>
            )}

            {/* Tombol hapus foto */}
            {uploadTarget.imageUrl && (
              <button
                onClick={() => deleteImageMutation.mutate(uploadTarget.id)}
                disabled={deleteImageMutation.isPending}
                className="w-full mt-3 text-sm py-2 rounded-xl transition"
                style={{ color: '#DC2626', border: '1px solid #FECACA', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {deleteImageMutation.isPending ? 'Menghapus...' : '🗑️ Hapus foto'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
