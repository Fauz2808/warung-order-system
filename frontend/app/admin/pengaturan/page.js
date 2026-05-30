'use client';
// app/admin/pengaturan/page.js — Pengaturan jam operasional + kelola akun

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getSettings, updateSettings, getUsers, createUser, updateUser, deleteUser, changePassword } from '@/lib/api';

const EMPTY_USER_FORM  = { username: '', password: '', name: '' };
const EMPTY_EDIT_FORM  = { name: '', password: '', isActive: true };
const EMPTY_PW_FORM    = { currentPassword: '', newPassword: '', confirmPassword: '' };

function NotifToggle() {
  const [permission, setPermission] = useState('default');

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission);
  }, []);

  const handleToggle = async () => {
    if (!('Notification' in window)) {
      toast.error('Browser kamu tidak mendukung notifikasi');
      return;
    }
    if (permission === 'granted') {
      toast('Untuk menonaktifkan, ubah di pengaturan browser kamu.', { icon: 'ℹ️' });
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') toast.success('Notifikasi diaktifkan! 🔔');
    else if (result === 'denied') toast.error('Notifikasi diblokir. Ubah di pengaturan browser.');
  };

  const isGranted = permission === 'granted';
  const isDenied  = permission === 'denied';

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5" style={{ border: '1px solid #E8ECE4' }}>
      <h2 className="font-bold mb-1" style={{ color: '#1C1C1A' }}>🔔 Notifikasi Order</h2>
      <p className="text-xs mb-4" style={{ color: '#9CA38F' }}>
        Terima alert suara + popup saat order baru masuk, meski tab kasir sedang tidak aktif.
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ background: isGranted ? '#EDF1EA' : isDenied ? '#FEF2F2' : '#FFF8EC' }}>
            {isGranted ? '🔔' : isDenied ? '🔕' : '🔕'}
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#1C1C1A' }}>
              {isGranted ? 'Notifikasi Aktif' : isDenied ? 'Notifikasi Diblokir' : 'Notifikasi Belum Diaktifkan'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: isDenied ? '#DC2626' : '#9CA38F' }}>
              {isGranted
                ? 'Suara + popup browser aktif saat order masuk'
                : isDenied
                ? 'Buka Site Settings di browser → izinkan notifikasi'
                : 'Klik toggle untuk mengaktifkan'}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          className="relative inline-flex h-7 w-14 items-center rounded-full transition flex-shrink-0"
          style={{ backgroundColor: isGranted ? '#658051' : '#E8ECE4' }}
        >
          <span
            className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
            style={{ transform: isGranted ? 'translateX(32px)' : 'translateX(4px)' }}
          />
        </button>
      </div>
      {isDenied && (
        <div className="mt-3 rounded-xl px-4 py-3 text-xs" style={{ background: '#FEF2F2', color: '#DC2626' }}>
          Browser memblokir notifikasi untuk site ini. Klik ikon 🔒 di address bar → <strong>Notifications → Allow</strong>, lalu refresh halaman.
        </div>
      )}
    </div>
  );
}

function getRoleFromToken() {
  if (typeof window === 'undefined') return null;
  try {
    const token = localStorage.getItem('kasir_token');
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1])).role;
  } catch { return null; }
}

export default function PengaturanPage() {
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => { setIsOwner(getRoleFromToken() === 'owner'); }, []);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ openTime: '08:00', closeTime: '22:00', isForceClose: false });

  // State kelola akun
  const [showAddUser, setShowAddUser]     = useState(false);
  const [userForm, setUserForm]           = useState(EMPTY_USER_FORM);
  const [editUser, setEditUser]           = useState(null);   // { id, name, username, isActive }
  const [editForm, setEditForm]           = useState(EMPTY_EDIT_FORM);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [showChangePw, setShowChangePw]   = useState(false);
  const [pwForm, setPwForm]               = useState(EMPTY_PW_FORM);

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

  // ─── User queries & mutations ─────────────────────────────
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers });

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Akun kasir berhasil dibuat!');
      setShowAddUser(false);
      setUserForm(EMPTY_USER_FORM);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal membuat akun'),
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }) => updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Akun berhasil diperbarui!');
      setEditUser(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal memperbarui akun'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Akun kasir dihapus');
      setDeleteConfirmUser(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menghapus akun'),
  });

  const changePwMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast.success('Password berhasil diganti!');
      setShowChangePw(false);
      setPwForm(EMPTY_PW_FORM);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal mengganti password'),
  });

  const handleSave = (e) => {
    e.preventDefault();
    saveMutation.mutate({ openTime: form.openTime, closeTime: form.closeTime });
  };

  const handleChangePw = (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error('Konfirmasi password tidak cocok');
      return;
    }
    changePwMutation.mutate({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
  };

  // Status badge
  const isCurrentlyOpen = settings?.isOpen;

  return (
    <div className="p-6 max-w-2xl space-y-6" style={{ backgroundColor: '#F7F7F5', minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#1C1C1A' }}>⚙️ Pengaturan</h1>
        <p className="text-sm mt-1" style={{ color: '#6B7560' }}>
          Atur status warung, jam operasional &amp; notifikasi
        </p>
      </div>

      {/* Status card — semua staff bisa lihat dan toggle */}
      {<div
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

      {/* Notifikasi */}
      <NotifToggle />

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
          <li className="flex gap-2"><span>•</span><span>Di luar jam operasional, halaman customer menampilkan pesan <strong style={{ color: '#1C1C1A' }}>&quot;Warung Tutup&quot;</strong></span></li>
          <li className="flex gap-2"><span>•</span><span>Customer tidak bisa submit order saat warung tutup</span></li>
          <li className="flex gap-2"><span>•</span><span><strong style={{ color: '#1C1C1A' }}>Tutup Paksa</strong> menutup warung kapan saja (berguna saat libur mendadak)</span></li>
          <li className="flex gap-2"><span>•</span><span>Semua jam dalam zona waktu <strong style={{ color: '#1C1C1A' }}>WIB (GMT+7)</strong></span></li>
        </ul>
      </div>

      {/* ── Kelola Akun + Ganti Password — owner only ──────── */}
      {isOwner && <>
      <div className="bg-white rounded-2xl shadow-sm p-5" style={{ border: '1px solid #E8ECE4' }}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold" style={{ color: '#1C1C1A' }}>👥 Kelola Akun</h2>
          <button
            onClick={() => { setShowAddUser(true); setEditUser(null); }}
            className="text-sm px-3 py-1.5 rounded-xl font-semibold text-white transition"
            style={{ backgroundColor: '#658051' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4d6340'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#658051'}
          >
            + Tambah Kasir
          </button>
        </div>
        <p className="text-xs mb-4" style={{ color: '#9CA38F' }}>Kasir bisa akses dashboard & kelola menu. Owner punya akses penuh.</p>

        {/* List users */}
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-4 py-3 rounded-2xl border" style={{ border: '1.5px solid #E8ECE4', background: '#FAFAF8' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: u.role === 'owner' ? '#FFF8EC' : '#EDF1EA', color: u.role === 'owner' ? '#92660A' : '#658051' }}>
                  {(u.name || u.username)?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: '#1C1C1A' }}>{u.name || u.username}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={u.role === 'owner'
                        ? { background: '#FFF8EC', color: '#92660A', border: '1px solid #F59E0B' }
                        : { background: '#EDF1EA', color: '#658051', border: '1px solid #c8d8c0' }}>
                      {u.role === 'owner' ? '👑 Owner' : '🧑‍💼 Kasir'}
                    </span>
                    {!u.isActive && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>Nonaktif</span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: '#9CA38F' }}>@{u.username}</p>
                </div>
              </div>
              {/* Aksi — owner tidak bisa diedit/dihapus */}
              {u.role !== 'owner' && (
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => { setEditUser(u); setEditForm({ name: u.name || '', password: '', isActive: u.isActive }); setShowAddUser(false); }}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium border transition"
                    style={{ borderColor: '#E8ECE4', color: '#658051', backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#EDF1EA'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >Edit</button>
                  <button
                    onClick={() => setDeleteConfirmUser(u)}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium border transition"
                    style={{ borderColor: '#FECACA', color: '#DC2626', backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >Hapus</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Form Tambah Kasir */}
        {showAddUser && (
          <div className="mt-4 rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: '#658051', background: '#FAFFF8' }}>
            <p className="text-xs font-semibold" style={{ color: '#658051' }}>Tambah Akun Kasir Baru</p>

            {/* Username — full width, paling atas, paling penting */}
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: '#1C1C1A' }}>
                Username * <span className="font-normal" style={{ color: '#9CA38F' }}>— dipakai untuk login</span>
              </label>
              <input
                type="text"
                placeholder="contoh: aldi, kasir2, budi"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none font-mono"
                style={{ border: '2px solid #658051', color: '#1C1C1A', background: '#fff' }}
                onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 3px rgba(101,128,81,0.15)'}
                onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                autoFocus
              />
              {userForm.username && (
                <p className="text-xs mt-1" style={{ color: '#658051' }}>
                  ✓ Kasir akan login dengan: <strong>{userForm.username}</strong>
                </p>
              )}
            </div>

            {/* Password + Nama sejajar */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: '#1C1C1A' }}>Password *</label>
                <input type="password" placeholder="Min 4 karakter" value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ border: '1.5px solid #E8ECE4', color: '#1C1C1A' }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: '#6B7560' }}>Nama Tampilan <span className="font-normal">(opsional)</span></label>
                <input type="text" placeholder="Nama lengkap" value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ border: '1.5px solid #E8ECE4', color: '#1C1C1A' }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'} />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setShowAddUser(false); setUserForm(EMPTY_USER_FORM); }}
                className="flex-1 py-2 rounded-xl text-sm border font-medium"
                style={{ borderColor: '#E8ECE4', color: '#6B7560' }}>Batal</button>
              <button
                onClick={() => createUserMutation.mutate(userForm)}
                disabled={!userForm.username || !userForm.password || createUserMutation.isPending}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: '#658051' }}>
                {createUserMutation.isPending ? 'Menyimpan...' : '+ Tambah Kasir'}
              </button>
            </div>
          </div>
        )}

        {/* Form Edit Kasir */}
        {editUser && (
          <div className="mt-4 rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: '#658051', background: '#FAFFF8' }}>
            <p className="text-xs font-semibold" style={{ color: '#658051' }}>Edit akun <strong>@{editUser.username}</strong></p>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: '#6B7560' }}>Nama Tampilan</label>
              <input type="text" placeholder="Nama kasir" value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                style={{ border: '1.5px solid #E8ECE4', color: '#1C1C1A' }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: '#6B7560' }}>Password Baru (kosongkan jika tidak diganti)</label>
              <input type="password" placeholder="Biarkan kosong = tidak berubah" value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                style={{ border: '1.5px solid #E8ECE4', color: '#1C1C1A' }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'} />
            </div>
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#1C1C1A' }}>Akun Aktif</p>
                <p className="text-xs" style={{ color: '#9CA38F' }}>Nonaktifkan agar kasir tidak bisa login</p>
              </div>
              <button type="button" onClick={() => setEditForm((f) => ({ ...f, isActive: !f.isActive }))}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
                style={{ background: editForm.isActive ? '#658051' : '#D1D5DB' }}>
                <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  style={{ transform: editForm.isActive ? 'translateX(22px)' : 'translateX(2px)' }} />
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditUser(null)}
                className="flex-1 py-2 rounded-xl text-sm border font-medium"
                style={{ borderColor: '#E8ECE4', color: '#6B7560' }}>Batal</button>
              <button
                onClick={() => updateUserMutation.mutate({ id: editUser.id, data: editForm })}
                disabled={updateUserMutation.isPending}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: '#658051' }}>
                {updateUserMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Ganti Password Owner ─────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm p-5" style={{ border: '1px solid #E8ECE4' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold" style={{ color: '#1C1C1A' }}>🔑 Password Akun Owner</h2>
            <p className="text-xs mt-0.5" style={{ color: '#9CA38F' }}>Ganti password login akun owner kamu</p>
          </div>
          <button
            onClick={() => setShowChangePw(!showChangePw)}
            className="text-sm px-3 py-1.5 rounded-xl font-medium border transition"
            style={{ borderColor: '#E8ECE4', color: '#6B7560' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F7F7F5'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            {showChangePw ? 'Batal' : 'Ganti Password'}
          </button>
        </div>
        {showChangePw && (
          <form onSubmit={handleChangePw} className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: '#6B7560' }}>Password Sekarang</label>
              <input type="password" required value={pwForm.currentPassword}
                onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                style={{ border: '1.5px solid #E8ECE4', color: '#1C1C1A' }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: '#6B7560' }}>Password Baru (min 4 karakter)</label>
              <input type="password" required value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                style={{ border: '1.5px solid #E8ECE4', color: '#1C1C1A' }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: '#6B7560' }}>Konfirmasi Password Baru</label>
              <input type="password" required value={pwForm.confirmPassword}
                onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                style={{ border: '1.5px solid #E8ECE4', color: '#1C1C1A' }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'} />
            </div>
            <button type="submit" disabled={changePwMutation.isPending}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
              style={{ background: '#658051' }}
              onMouseEnter={(e) => !changePwMutation.isPending && (e.currentTarget.style.backgroundColor = '#4d6340')}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#658051'}>
              {changePwMutation.isPending ? 'Menyimpan...' : '🔑 Simpan Password Baru'}
            </button>
          </form>
        )}
      </div>

      {/* Modal konfirmasi hapus user */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirmUser(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-lg font-bold mb-1" style={{ color: '#1C1C1A' }}>Hapus Akun Kasir?</h3>
            <p className="text-sm mb-6" style={{ color: '#6B7560' }}>
              Akun <strong>@{deleteConfirmUser.username}</strong>{deleteConfirmUser.name ? ` (${deleteConfirmUser.name})` : ''} akan dihapus permanen.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmUser(null)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm border"
                style={{ borderColor: '#E8ECE4', color: '#6B7560' }}>Batal</button>
              <button onClick={() => deleteUserMutation.mutate(deleteConfirmUser.id)}
                disabled={deleteUserMutation.isPending}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-50"
                style={{ backgroundColor: '#DC2626' }}>
                {deleteUserMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
