'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getModifiers,
  createModifierGroup, updateModifierGroup, deleteModifierGroup,
  createModifierOption, updateModifierOption, deleteModifierOption,
} from '@/lib/api';

const EMPTY_GROUP  = { name: '', required: false, multiSelect: false, minSelect: 0, maxSelect: '', sortOrder: 0 };
const EMPTY_OPTION = { name: '', priceAdd: 0, isDefault: false, isAvailable: true, sortOrder: 0 };

function formatRupiah(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
}

// ─── Modal Tambah/Edit Kategori Pilihan ──────────────────
function GroupModal({ group, onClose, onSave, isPending }) {
  const [form, setForm] = useState(group || EMPTY_GROUP);
  const isEdit = !!group?.id;

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      name:        form.name.trim(),
      required:    form.required,
      multiSelect: form.multiSelect,
      minSelect:   parseInt(form.minSelect) || 0,
      maxSelect:   form.maxSelect === '' || form.maxSelect === null ? null : parseInt(form.maxSelect),
      sortOrder:   parseInt(form.sortOrder) || 0,
    };
    onSave(data);
  };

  const inputStyle = {
    border: '1.5px solid #E8ECE4', color: '#1A1A1A',
    borderRadius: '0.75rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none', width: '100%',
  };
  const focusStyle = (e) => { e.currentTarget.style.borderColor = '#1B4332'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(101,128,81,0.2)'; };
  const blurStyle  = (e) => { e.currentTarget.style.borderColor = '#E8ECE4'; e.currentTarget.style.boxShadow = 'none'; };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#E8ECE4' }}>
          <h2 className="text-lg font-bold" style={{ color: '#1A1A1A' }}>
            {isEdit ? 'Edit Kategori Pilihan' : 'Tambah Kategori Pilihan'}
          </h2>
          <button onClick={onClose} style={{ color: '#9CA3AF', fontSize: '1.25rem' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#1A1A1A' }}>Nama Kategori *</label>
            <input
              required autoFocus
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="contoh: Ukuran, Suhu, Tambahan"
              style={inputStyle}
              onFocus={focusStyle} onBlur={blurStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Required toggle */}
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: '#F5EFE6' }}>
              <div>
                <p className="text-xs font-semibold" style={{ color: '#1A1A1A' }}>Wajib dipilih</p>
                <p className="text-xs" style={{ color: '#9CA3AF' }}>Customer harus pilih</p>
              </div>
              <button type="button" onClick={() => setForm((f) => ({ ...f, required: !f.required }))}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
                style={{ background: form.required ? '#1B4332' : '#D1D5DB' }}>
                <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  style={{ transform: form.required ? 'translateX(22px)' : 'translateX(2px)' }} />
              </button>
            </div>

            {/* Multi select toggle */}
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: '#F5EFE6' }}>
              <div>
                <p className="text-xs font-semibold" style={{ color: '#1A1A1A' }}>Multi pilih</p>
                <p className="text-xs" style={{ color: '#9CA3AF' }}>Bisa pilih lebih dari 1</p>
              </div>
              <button type="button" onClick={() => setForm((f) => ({ ...f, multiSelect: !f.multiSelect }))}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
                style={{ background: form.multiSelect ? '#1B4332' : '#D1D5DB' }}>
                <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  style={{ transform: form.multiSelect ? 'translateX(22px)' : 'translateX(2px)' }} />
              </button>
            </div>
          </div>

          {form.multiSelect && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#6B7280' }}>Min pilih</label>
                <input type="number" min="0" value={form.minSelect}
                  onChange={(e) => setForm({ ...form, minSelect: e.target.value })}
                  style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#6B7280' }}>Max pilih <span className="font-normal">(kosong = bebas)</span></label>
                <input type="number" min="1" value={form.maxSelect}
                  onChange={(e) => setForm({ ...form, maxSelect: e.target.value })}
                  placeholder="—"
                  style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#6B7280' }}>Urutan tampil</label>
            <input type="number" min="0" value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition"
              style={{ border: '1px solid #E8ECE4', color: '#6B7280', backgroundColor: 'transparent' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5EFE6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
              Batal
            </button>
            <button type="submit" disabled={isPending || !form.name.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
              style={{ background: '#1B4332' }}
              onMouseEnter={(e) => !isPending && (e.currentTarget.style.backgroundColor = '#2D6A4F')}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1B4332'}>
              {isPending ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Tambah Kategori'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Card satu Modifier Group ────────────────────────────
function GroupCard({ group, onEditGroup, onDeleteGroup }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded]       = useState(false);
  const [showAddOption, setShowAddOption] = useState(false);
  const [optionForm, setOptionForm]   = useState(EMPTY_OPTION);
  const [editOption, setEditOption]   = useState(null); // option object
  const [editOptForm, setEditOptForm] = useState(EMPTY_OPTION);
  const [deleteOptConfirm, setDeleteOptConfirm] = useState(null);

  const addOptMutation = useMutation({
    mutationFn: (data) => createModifierOption(group.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifier-groups'] });
      toast.success('Pilihan berhasil ditambahkan!');
      setOptionForm(EMPTY_OPTION);
      setShowAddOption(false);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menambah opsi'),
  });

  const updateOptMutation = useMutation({
    mutationFn: ({ id, data }) => updateModifierOption(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifier-groups'] });
      toast.success('Pilihan berhasil diperbarui!');
      setEditOption(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal memperbarui opsi'),
  });

  const deleteOptMutation = useMutation({
    mutationFn: deleteModifierOption,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifier-groups'] });
      toast.success('Pilihan dihapus');
      setDeleteOptConfirm(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menghapus opsi'),
  });

  const inputSm = {
    border: '1.5px solid #E8ECE4', color: '#1A1A1A', borderRadius: '0.5rem',
    padding: '0.375rem 0.625rem', fontSize: '0.8125rem', outline: 'none',
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm" style={{ border: '1px solid #E8ECE4' }}>
      {/* Group header */}
      <div className="px-5 py-4 flex items-center justify-between">
        <button className="flex-1 text-left flex items-center gap-3 min-w-0" onClick={() => setExpanded(!expanded)}>
          <span className="text-base font-bold truncate" style={{ color: '#1A1A1A' }}>{group.name}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {group.required && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: '#FEF3C7', color: '#92400E' }}>Wajib</span>
            )}
            {group.multiSelect && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: '#EFF6FF', color: '#1D4ED8' }}>Multi</span>
            )}
            <span className="text-xs" style={{ color: '#9CA3AF' }}>
              {group.options?.length || 0} opsi
            </span>
            <span className="text-xs ml-1" style={{ color: '#C8CCBE' }}>
              {expanded ? '▲' : '▼'}
            </span>
          </div>
        </button>

        <div className="flex gap-1.5 ml-3 shrink-0">
          <button
            onClick={() => onEditGroup(group)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition"
            style={{ background: '#EFF6FF', color: '#2563EB' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DBEAFE'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#EFF6FF'}>
            Edit
          </button>
          <button
            onClick={() => onDeleteGroup(group)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition"
            style={{ border: '1px solid #FECACA', color: '#DC2626', backgroundColor: 'transparent' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            Hapus
          </button>
        </div>
      </div>

      {/* Expanded — options list */}
      {expanded && (
        <div className="px-5 pb-4" style={{ borderTop: '1px dashed #E8ECE4' }}>
          <div className="pt-3 space-y-2">
            {group.options?.length === 0 && (
              <p className="text-xs text-center py-3" style={{ color: '#9CA3AF' }}>Belum ada pilihan. Tambahkan di bawah.</p>
            )}

            {group.options?.map((opt) => (
              <div key={opt.id}>
                {editOption?.id === opt.id ? (
                  // Inline edit form
                  <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: '#F5EFE6' }}>
                    <input
                      autoFocus
                      type="text"
                      value={editOptForm.name}
                      onChange={(e) => setEditOptForm({ ...editOptForm, name: e.target.value })}
                      placeholder="Nama opsi"
                      style={{ ...inputSm, flex: 2 }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#1B4332'}
                      onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'}
                    />
                    <input
                      type="number" min="0"
                      value={editOptForm.priceAdd}
                      onChange={(e) => setEditOptForm({ ...editOptForm, priceAdd: parseInt(e.target.value) || 0 })}
                      placeholder="Harga tambah"
                      style={{ ...inputSm, flex: 1 }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#1B4332'}
                      onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'}
                    />
                    <button
                      onClick={() => {
                        if (!editOptForm.name.trim()) return;
                        updateOptMutation.mutate({ id: opt.id, data: { name: editOptForm.name.trim(), priceAdd: editOptForm.priceAdd, isDefault: editOptForm.isDefault, isAvailable: editOptForm.isAvailable } });
                      }}
                      disabled={updateOptMutation.isPending}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40"
                      style={{ background: '#1B4332' }}>
                      {updateOptMutation.isPending ? '...' : 'Simpan'}
                    </button>
                    <button onClick={() => setEditOption(null)}
                      className="px-2 py-1.5 rounded-lg text-xs"
                      style={{ color: '#6B7280' }}>✕</button>
                  </div>
                ) : (
                  // Option row
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                    style={{ background: opt.isAvailable ? '#FAFAF8' : '#FEF2F2', border: '1px solid #F3F4F6' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: opt.isAvailable ? '#1A1A1A' : '#9CA3AF' }}>
                        {opt.name}
                      </span>
                      {opt.priceAdd > 0 && (
                        <span className="text-xs shrink-0" style={{ color: '#1B4332' }}>+{formatRupiah(opt.priceAdd)}</span>
                      )}
                      {opt.isDefault && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: '#D8F3DC', color: '#1B4332' }}>Default</span>
                      )}
                      {!opt.isAvailable && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: '#FEF2F2', color: '#DC2626' }}>Nonaktif</span>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => {
                          setEditOption(opt);
                          setEditOptForm({ name: opt.name, priceAdd: opt.priceAdd, isDefault: opt.isDefault, isAvailable: opt.isAvailable, sortOrder: opt.sortOrder });
                        }}
                        className="text-xs px-2 py-1 rounded-lg transition"
                        style={{ background: '#EFF6FF', color: '#2563EB' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DBEAFE'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#EFF6FF'}>
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteOptConfirm(opt)}
                        className="text-xs px-2 py-1 rounded-lg transition"
                        style={{ background: '#FEF2F2', color: '#DC2626' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}>
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Tambah opsi baru */}
            {showAddOption ? (
              <div className="flex items-center gap-2 p-3 rounded-xl mt-1" style={{ background: '#F5EFE6', border: '1.5px dashed #1B4332' }}>
                <input
                  autoFocus
                  type="text"
                  value={optionForm.name}
                  onChange={(e) => setOptionForm({ ...optionForm, name: e.target.value })}
                  placeholder="Nama pilihan (contoh: Medium)"
                  style={{ ...inputSm, flex: 2 }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#1B4332'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); if (optionForm.name.trim()) addOptMutation.mutate({ name: optionForm.name.trim(), priceAdd: optionForm.priceAdd, isDefault: optionForm.isDefault, isAvailable: true, sortOrder: optionForm.sortOrder }); }
                  }}
                />
                <input
                  type="number" min="0"
                  value={optionForm.priceAdd}
                  onChange={(e) => setOptionForm({ ...optionForm, priceAdd: parseInt(e.target.value) || 0 })}
                  placeholder="Harga tambah (Rp)"
                  style={{ ...inputSm, flex: 1 }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#1B4332'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'}
                />
                <button
                  onClick={() => {
                    if (!optionForm.name.trim()) return;
                    addOptMutation.mutate({ name: optionForm.name.trim(), priceAdd: optionForm.priceAdd, isDefault: optionForm.isDefault, isAvailable: true, sortOrder: optionForm.sortOrder });
                  }}
                  disabled={addOptMutation.isPending || !optionForm.name.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40"
                  style={{ background: '#1B4332' }}>
                  {addOptMutation.isPending ? '...' : '+ Tambah'}
                </button>
                <button onClick={() => { setShowAddOption(false); setOptionForm(EMPTY_OPTION); }}
                  className="px-2 py-1.5 rounded-lg text-xs"
                  style={{ color: '#6B7280' }}>✕</button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddOption(true)}
                className="w-full mt-1 py-2 rounded-xl text-xs font-medium transition"
                style={{ border: '1.5px dashed #D1D5DB', color: '#6B7280', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1B4332'; e.currentTarget.style.color = '#1B4332'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.color = '#6B7280'; }}>
                + Tambah Pilihan
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal konfirmasi hapus opsi */}
      {deleteOptConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteOptConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">🗑️</div>
            <h3 className="text-lg font-bold mb-1" style={{ color: '#1A1A1A' }}>Hapus Pilihan?</h3>
            <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
              Pilihan <strong>{deleteOptConfirm.name}</strong> akan dihapus dari kategori ini.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteOptConfirm(null)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                style={{ border: '1px solid #E8ECE4', color: '#6B7280' }}>Batal</button>
              <button onClick={() => deleteOptMutation.mutate(deleteOptConfirm.id)}
                disabled={deleteOptMutation.isPending}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-50"
                style={{ backgroundColor: '#DC2626' }}>
                {deleteOptMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────
export default function ModifierPage() {
  const queryClient = useQueryClient();
  const [groupModal, setGroupModal] = useState(null); // null | 'add' | group object
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['modifier-groups'],
    queryFn: getModifiers,
  });

  const createGroupMutation = useMutation({
    mutationFn: createModifierGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifier-groups'] });
      toast.success('Kategori pilihan berhasil dibuat!');
      setGroupModal(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal membuat group'),
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }) => updateModifierGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifier-groups'] });
      toast.success('Kategori pilihan berhasil diperbarui!');
      setGroupModal(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal memperbarui group'),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: deleteModifierGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifier-groups'] });
      toast.success('Kategori pilihan dihapus');
      setDeleteGroupConfirm(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menghapus group'),
  });

  const handleSaveGroup = (data) => {
    if (groupModal?.id) {
      updateGroupMutation.mutate({ id: groupModal.id, data });
    } else {
      createGroupMutation.mutate(data);
    }
  };

  const isMutatingGroup = createGroupMutation.isPending || updateGroupMutation.isPending;

  return (
    <div className="p-6 max-w-2xl" style={{ backgroundColor: '#F5EFE6', minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#1A1A1A' }}>Opsi Menu</h1>
          <p className="text-sm mt-0.5" style={{ color: '#9CA3AF' }}>
            Buat pilihan seperti Ukuran, Suhu, atau Tambahan — lalu terapkan ke menu
          </p>
        </div>
        <button
          onClick={() => setGroupModal('add')}
          className="text-white px-4 py-2 rounded-xl text-sm transition flex items-center gap-1.5 shrink-0"
          style={{ backgroundColor: '#1B4332', fontWeight: 500 }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2D6A4F'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1B4332'}>
          + Tambah Kategori
        </button>
      </div>

      {/* Info banner */}
      <div className="rounded-xl px-4 py-3 mb-5 flex items-start gap-2 text-xs" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8' }}>
        <span className="shrink-0 mt-0.5">💡</span>
        <span>
          Setelah membuat kategori dan pilihan di sini, buka <strong>Kelola Menu</strong> → edit menu → centang kategori yang ingin diterapkan ke menu tersebut.
        </span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-16" style={{ color: '#9CA3AF' }}>Memuat modifier...</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#9CA3AF' }}>
          <p className="text-4xl mb-2">⚙️</p>
          <p className="font-medium mb-1" style={{ color: '#6B7280' }}>Belum ada kategori pilihan</p>
          <p className="text-sm">Klik &quot;+ Tambah Kategori&quot; untuk mulai, contoh: Ukuran, Suhu, atau Tambahan.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
            .map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                onEditGroup={(g) => setGroupModal(g)}
                onDeleteGroup={(g) => setDeleteGroupConfirm(g)}
              />
            ))}
        </div>
      )}

      {/* Modal Group */}
      {groupModal && (
        <GroupModal
          group={groupModal === 'add' ? null : groupModal}
          onClose={() => setGroupModal(null)}
          onSave={handleSaveGroup}
          isPending={isMutatingGroup}
        />
      )}

      {/* Modal konfirmasi hapus group */}
      {deleteGroupConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteGroupConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-lg font-bold mb-1" style={{ color: '#1A1A1A' }}>Hapus Kategori Pilihan?</h3>
            <p className="text-sm mb-2" style={{ color: '#6B7280' }}>
              Kategori <strong>{deleteGroupConfirm.name}</strong> dan semua pilihannya akan dihapus permanen.
            </p>
            <p className="text-xs mb-6 px-3 py-2 rounded-xl" style={{ background: '#FEF3C7', color: '#92400E' }}>
              ⚠️ Menu yang menggunakan kategori ini akan kehilangan pilihan tersebut.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteGroupConfirm(null)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                style={{ border: '1px solid #E8ECE4', color: '#6B7280' }}>Batal</button>
              <button onClick={() => deleteGroupMutation.mutate(deleteGroupConfirm.id)}
                disabled={deleteGroupMutation.isPending}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-50"
                style={{ backgroundColor: '#DC2626' }}>
                {deleteGroupMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
