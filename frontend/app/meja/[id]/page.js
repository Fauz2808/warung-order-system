'use client';
// app/meja/[id]/page.js
// Halaman utama customer — muncul saat scan QR meja

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getTable, getMenu, createOrder, getSettings } from '@/lib/api';
import useCartStore from '@/store/cartStore';

// ─── Design tokens ────────────────────────────────────
// Primary: #658051 (earthy olive green)
const PRIMARY       = '#658051';
const PRIMARY_DARK  = '#4d6340';
const PRIMARY_LIGHT = '#EDF1EA';

const formatRupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

export default function MejaPage() {
  const { id } = useParams();
  const tableId = parseInt(id);
  const [activeCategory, setActiveCategory] = useState('semua');
  const [showCart, setShowCart] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [addItemModal, setAddItemModal] = useState(null);
  const [orderType, setOrderType] = useState('dine-in');

  const HOT_ICE_CATEGORIES = ['coffee', 'americano', 'slow-bar', 'signature'];

  const { items, addItem, removeItem, getTotal, getTotalItems, clearCart, setTable } = useCartStore();

  const { data: table, isLoading: loadingTable, error: tableError } = useQuery({
    queryKey: ['table', tableId],
    queryFn: () => getTable(tableId),
  });

  const { data: menu = [], isLoading: loadingMenu } = useQuery({
    queryKey: ['menu'],
    queryFn: getMenu,
  });

  const { data: shopSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (table) setTable(table.id, table.number);
  }, [table, setTable]);

  const orderMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: (res) => {
      setOrderSuccess(res.data);
      clearCart();
      setShowCart(false);
      toast.success('Pesanan berhasil dikirim! 🎉');
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'Gagal mengirim pesanan. Coba lagi.';
      toast.error(msg);
    },
  });

  const handleOrder = () => {
    if (items.length === 0) return;
    orderMutation.mutate({
      tableId,
      orderType,
      items: items.map((i) => ({ menuId: i.menuId, quantity: i.quantity, notes: i.notes })),
    });
  };

  const getQuantity = (menuId) => items.find((i) => i.menuId === menuId)?.quantity || 0;

  const handleAddItem = (item) => setAddItemModal(item);

  const handleConfirmAdd = ({ temp, notes }) => {
    if (!addItemModal) return;
    const combinedNotes = [temp, notes].filter(Boolean).join(' · ');
    addItem({ ...addItemModal, notes: combinedNotes });
    setAddItemModal(null);
    toast.success(`${addItemModal.name} ditambahkan!`, { duration: 1500 });
  };

  const filteredMenu = activeCategory === 'semua' ? menu : menu.filter((m) => m.category === activeCategory);

  const categories = [
    { value: 'semua',      label: 'Semua',      emoji: '✦' },
    { value: 'signature',  label: 'Signature',  emoji: '⭐' },
    { value: 'coffee',     label: 'Coffee',     emoji: '☕' },
    { value: 'americano',  label: 'Americano',  emoji: '🫖' },
    { value: 'slow-bar',   label: 'Slow Bar',   emoji: '🔬' },
    { value: 'non-coffee', label: 'Non Coffee', emoji: '🧋' },
    { value: 'foods',      label: 'Foods',      emoji: '🍟' },
    { value: 'additional', label: 'Extra',      emoji: '➕' },
  ];

  if (loadingTable) return <LoadingScreen />;
  if (tableError)   return <ErrorScreen message="Meja tidak ditemukan. Cek kembali QR code kamu." />;

  // Warung tutup
  if (shopSettings && !shopSettings.isOpen) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F7F7F5' }}>
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-6xl mb-4">🌙</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#1C1C1A' }}>Warung Tutup</h2>
          <p className="text-sm mb-5" style={{ color: '#6B7560' }}>
            {shopSettings.isForceClose
              ? 'Warung sedang tutup sementara. Mohon maaf atas ketidaknyamanannya.'
              : 'Maaf, kami sedang tidak beroperasi saat ini.'}
          </p>
          <div className="rounded-2xl p-4 mb-5" style={{ background: PRIMARY_LIGHT }}>
            <p className="text-xs mb-1" style={{ color: '#6B7560' }}>Jam Operasional</p>
            <p className="text-2xl font-bold" style={{ color: PRIMARY }}>
              {shopSettings.openTime} – {shopSettings.closeTime}
            </p>
            <p className="text-xs mt-1" style={{ color: '#9CA38F' }}>WIB · setiap hari</p>
          </div>
          <p className="text-xs" style={{ color: '#9CA38F' }}>Halaman otomatis refresh saat warung buka ☕</p>
        </div>
      </div>
    );
  }

  // Order sukses
  if (orderSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F7F7F5' }}>
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl" style={{ background: PRIMARY_LIGHT }}>
            ✓
          </div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: '#1C1C1A' }}>Pesanan Terkirim!</h2>
          <p className="text-sm mb-5" style={{ color: '#6B7560' }}>Pesananmu sedang diproses oleh dapur.</p>
          <div className="rounded-2xl p-4 mb-5 text-left" style={{ background: '#F7F7F5' }}>
            <p className="text-xs mb-0.5" style={{ color: '#9CA38F' }}>Nomor Order</p>
            <p className="text-2xl font-bold mb-2" style={{ color: PRIMARY }}>#{orderSuccess.id}</p>
            <p className="text-xs mb-0.5" style={{ color: '#9CA38F' }}>Total</p>
            <p className="font-semibold" style={{ color: '#1C1C1A' }}>{formatRupiah(orderSuccess.totalAmount)}</p>
          </div>
          <p className="text-xs mb-5" style={{ color: '#9CA38F' }}>Silahkan tunggu, kami akan segera menyiapkan pesananmu ☕</p>
          <button
            onClick={() => setOrderSuccess(null)}
            className="w-full py-3.5 rounded-2xl font-semibold text-white transition"
            style={{ background: PRIMARY }}
          >
            Pesan Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: '#F7F7F5' }}>

      {/* ── Header ─────────────────────────────────── */}
      <div className="px-4 pt-10 pb-5" style={{ background: '#F7F7F5' }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: PRIMARY }}>
              Carra Coffee
            </p>
            <h1 className="text-3xl font-black" style={{ color: '#1C1C1A', letterSpacing: '-0.5px' }}>
              Meja {table?.number}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#9CA38F' }}>
              Lantai {table?.floor}
            </p>
          </div>
          {getTotalItems() > 0 && (
            <button
              onClick={() => setShowCart(true)}
              className="w-11 h-11 rounded-2xl flex items-center justify-center relative shadow-sm"
              style={{ background: PRIMARY }}
            >
              <span className="text-white text-lg">🛒</span>
              <span
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center text-white"
                style={{ background: '#E84040' }}
              >
                {getTotalItems()}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── Category Tabs ────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b" style={{ borderColor: '#E8ECE4' }}>
        <div className="flex gap-1.5 px-4 py-3 overflow-x-auto scrollbar-hide">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.value;
            const count = cat.value === 'semua' ? menu.length : menu.filter(m => m.category === cat.value).length;
            if (cat.value !== 'semua' && count === 0) return null;
            return (
              <button
                key={cat.value}
                onClick={() => setActiveCategory(cat.value)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 border"
                style={{
                  background: isActive ? PRIMARY : 'transparent',
                  color:      isActive ? '#fff' : '#6B7560',
                  borderColor: isActive ? PRIMARY : '#E8ECE4',
                }}
              >
                <span className="text-xs">{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Menu Grid ───────────────────────────── */}
      <div className="px-4 pt-4">
        {loadingMenu ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse">
                <div className="h-36 bg-gray-100" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredMenu.length === 0 ? (
          <div className="text-center py-16" style={{ color: '#9CA38F' }}>
            <p className="text-4xl mb-3">☕</p>
            <p className="font-medium">Menu tidak tersedia</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredMenu.map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                quantity={getQuantity(item.id)}
                onAdd={() => handleAddItem(item)}
                onRemove={() => removeItem(item.id)}
                needsTempChoice={HOT_ICE_CATEGORIES.includes(item.category)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Cart bar ────────────────────────────── */}
      {getTotalItems() > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-6 pt-3" style={{ background: 'linear-gradient(to top, #F7F7F5 70%, transparent)' }}>
          <button
            onClick={() => setShowCart(true)}
            className="w-full rounded-2xl py-4 px-5 flex items-center justify-between shadow-lg transition active:scale-95"
            style={{ background: PRIMARY }}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: '#4d6340', color: '#fff' }}>
                {getTotalItems()}
              </div>
              <span className="font-semibold text-white">Lihat Pesanan</span>
            </div>
            <span className="font-bold text-white">{formatRupiah(getTotal())}</span>
          </button>
        </div>
      )}

      {/* ── Modal Tambah Item ────────────────────── */}
      {addItemModal && (
        <AddItemModal
          item={addItemModal}
          needsTemp={HOT_ICE_CATEGORIES.includes(addItemModal.category)}
          onConfirm={handleConfirmAdd}
          onClose={() => setAddItemModal(null)}
        />
      )}

      {/* ── Modal Keranjang ─────────────────────── */}
      {showCart && (
        <CartModal
          items={items}
          total={getTotal()}
          onClose={() => setShowCart(false)}
          onOrder={handleOrder}
          onAdd={addItem}
          onRemove={removeItem}
          loading={orderMutation.isPending}
          menu={menu}
          orderType={orderType}
          setOrderType={setOrderType}
        />
      )}
    </div>
  );
}

// ─── MenuCard ─────────────────────────────────────────
function MenuCard({ item, quantity, onAdd, onRemove, needsTempChoice }) {
  const categoryEmoji = {
    'signature':  '⭐',
    'coffee':     '☕',
    'americano':  '🫖',
    'slow-bar':   '🔬',
    'non-coffee': '🧋',
    'foods':      '🍟',
    'additional': '➕',
  }[item.category] ?? '☕';

  const unavailable = !item.isAvailable;

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden shadow-sm transition"
      style={{ opacity: unavailable ? 0.55 : 1, border: '1px solid #F0F0EC' }}
    >
      {/* Foto */}
      <div className="relative h-36 bg-gray-50 flex items-center justify-center overflow-hidden">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">{categoryEmoji}</span>
        )}
        {/* Badge Habis / Sisa */}
        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
            <span className="text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-full">Habis</span>
          </div>
        )}
        {!unavailable && item.stock !== null && item.stock <= 5 && item.stock > 0 && (
          <div className="absolute top-2 left-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: '#D97706' }}>
              Sisa {item.stock}
            </span>
          </div>
        )}
        {/* Hot/Ice badge */}
        {needsTempChoice && !unavailable && (
          <div className="absolute top-2 right-2">
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/80 text-gray-600 font-medium">H/I</span>
          </div>
        )}
        {/* Qty badge */}
        {quantity > 0 && (
          <div
            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow"
            style={{ background: '#658051' }}
          >
            {quantity}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-sm leading-tight mb-0.5 line-clamp-2" style={{ color: '#1C1C1A' }}>{item.name}</p>
        {item.description && (
          <p className="text-xs line-clamp-1 mb-1.5" style={{ color: '#9CA38F' }}>{item.description}</p>
        )}
        <div className="flex items-center justify-between mt-2">
          <p className="font-bold text-sm" style={{ color: '#658051' }}>
            {formatRupiah(item.price)}
          </p>
          {!unavailable && (
            <div className="flex items-center gap-1.5">
              {quantity > 0 && (
                <button
                  onClick={onRemove}
                  className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-base transition"
                  style={{ background: '#EDF1EA', color: '#658051' }}
                >
                  −
                </button>
              )}
              <button
                onClick={onAdd}
                className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-base text-white transition"
                style={{ background: '#658051' }}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AddItemModal ──────────────────────────────────────
function AddItemModal({ item, needsTemp, onConfirm, onClose }) {
  const [selectedTemp, setSelectedTemp] = useState(needsTemp ? null : 'none');
  const [notes, setNotes] = useState('');

  const categoryEmoji = {
    'signature': '⭐', 'coffee': '☕', 'americano': '🫖',
    'slow-bar': '🔬', 'non-coffee': '🧋', 'foods': '🍟', 'additional': '➕'
  }[item.category] ?? '☕';
  const canConfirm = !needsTemp || selectedTemp !== null;
  const quickNotes = ['Less sugar', 'Less ice', 'No ice', 'Extra sweet', 'No sugar', 'Extra shot'];

  return (
    <div className="fixed inset-0 z-40 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="overflow-y-auto px-5 pb-5 pt-2 flex-1">
          {/* Item info */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center text-2xl" style={{ background: '#F7F7F5' }}>
              {item.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                : categoryEmoji}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight" style={{ color: '#1C1C1A' }}>{item.name}</h3>
              <p className="font-semibold mt-0.5" style={{ color: '#658051' }}>
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(item.price)}
              </p>
            </div>
          </div>

          {/* Hot / Ice */}
          {needsTemp && (
            <div className="mb-5">
              <p className="text-sm font-semibold mb-3" style={{ color: '#1C1C1A' }}>
                Pilih Suhu <span style={{ color: '#E84040' }}>*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'Ice', label: 'Ice', emoji: '🧊', activeColor: '#2563EB', activeBg: '#EFF6FF', activeBorder: '#93C5FD' },
                  { value: 'Hot', label: 'Hot', emoji: '♨️', activeColor: '#DC2626', activeBg: '#FEF2F2', activeBorder: '#FCA5A5' },
                ].map((opt) => {
                  const isActive = selectedTemp === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedTemp(opt.value)}
                      className="flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition active:scale-95"
                      style={{
                        borderColor: isActive ? opt.activeBorder : '#E8ECE4',
                        background:  isActive ? opt.activeBg : '#FAFAF8',
                        color:       isActive ? opt.activeColor : '#6B7560',
                      }}
                    >
                      <span className="text-3xl">{opt.emoji}</span>
                      <span className="font-bold">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Catatan */}
          <div className="mb-2">
            <p className="text-sm font-semibold mb-2" style={{ color: '#1C1C1A' }}>
              Catatan <span className="font-normal text-xs" style={{ color: '#9CA38F' }}>(opsional)</span>
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {quickNotes.map((note) => (
                <button
                  key={note}
                  onClick={() => setNotes((prev) => prev ? `${prev}, ${note}` : note)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition"
                  style={{ background: '#FAFAF8', color: '#6B7560', borderColor: '#E8ECE4' }}
                >
                  + {note}
                </button>
              ))}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: less ice, no sugar..."
              rows={2}
              className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2"
              style={{
                border: '1.5px solid #E8ECE4',
                color: '#1C1C1A',
                '--tw-ring-color': '#658051',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-3 border-t" style={{ borderColor: '#F0F0EC' }}>
          <button
            onClick={() => onConfirm({ temp: selectedTemp === 'none' ? '' : selectedTemp, notes })}
            disabled={!canConfirm}
            className="w-full py-4 rounded-2xl font-bold text-base text-white transition disabled:opacity-40"
            style={{ background: '#658051' }}
          >
            {needsTemp && !selectedTemp ? 'Pilih suhu dulu' : 'Tambah ke Keranjang'}
          </button>
          <button onClick={onClose} className="w-full py-2 mt-1 text-sm" style={{ color: '#9CA38F' }}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CartModal ────────────────────────────────────────
function CartModal({ items, total, onClose, onOrder, onAdd, onRemove, loading, menu, orderType, setOrderType }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl max-h-[88vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F0F0EC' }}>
          <h2 className="text-lg font-bold" style={{ color: '#1C1C1A' }}>Pesanan Kamu</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition"
            style={{ background: '#F7F7F5', color: '#6B7560' }}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Dine In / Take Away */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#9CA38F' }}>Tipe Pesanan</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'dine-in',   label: 'Dine In',   emoji: '🪑' },
                { value: 'take-away', label: 'Take Away',  emoji: '🥡' },
              ].map((opt) => {
                const isActive = orderType === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setOrderType(opt.value)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold text-sm transition"
                    style={{
                      borderColor: isActive ? '#658051' : '#E8ECE4',
                      background:  isActive ? '#EDF1EA' : 'transparent',
                      color:       isActive ? '#658051' : '#6B7560',
                    }}
                  >
                    <span>{opt.emoji}</span> {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Item list */}
          <div style={{ borderTop: '1px solid #F0F0EC', paddingTop: '1rem' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#9CA38F' }}>Item</p>
            <div className="space-y-3">
              {items.map((item) => {
                const menuData = menu.find((m) => m.id === item.menuId);
                const notesParts = item.notes ? item.notes.split(' · ') : [];
                const tempNote  = notesParts.find(n => n === 'Ice' || n === 'Hot');
                const otherNotes = notesParts.filter(n => n !== 'Ice' && n !== 'Hot' && n !== 'none' && n !== '').join(', ');

                return (
                  <div key={item.menuId} className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-sm" style={{ color: '#1C1C1A' }}>{item.name}</p>
                        {tempNote === 'Ice' && (
                          <span className="text-xs bg-blue-50 text-blue-500 border border-blue-100 rounded-full px-1.5 py-0.5">🧊</span>
                        )}
                        {tempNote === 'Hot' && (
                          <span className="text-xs bg-red-50 text-red-400 border border-red-100 rounded-full px-1.5 py-0.5">♨️</span>
                        )}
                      </div>
                      {otherNotes && (
                        <p className="text-xs mt-0.5" style={{ color: '#9CA38F' }}>📝 {otherNotes}</p>
                      )}
                      <p className="text-xs mt-0.5" style={{ color: '#9CA38F' }}>{formatRupiah(item.price)} / item</p>
                    </div>
                    {/* Qty controls */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onRemove(item.menuId)}
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                        style={{ background: '#EDF1EA', color: '#658051' }}
                      >−</button>
                      <span className="w-5 text-center font-semibold text-sm" style={{ color: '#1C1C1A' }}>{item.quantity}</span>
                      <button
                        onClick={() => menuData && onAdd(menuData)}
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm text-white"
                        style={{ background: '#658051' }}
                      >+</button>
                    </div>
                    <p className="w-16 text-right font-semibold text-sm flex-shrink-0" style={{ color: '#1C1C1A' }}>
                      {formatRupiah(item.price * item.quantity)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4" style={{ borderTop: '1px solid #F0F0EC' }}>
          <div className="flex justify-between items-center mb-3">
            <span className="font-medium" style={{ color: '#6B7560' }}>Total</span>
            <span className="text-xl font-black" style={{ color: '#1C1C1A' }}>{formatRupiah(total)}</span>
          </div>
          <button
            onClick={onOrder}
            disabled={loading}
            className="w-full py-4 rounded-2xl font-bold text-base text-white transition disabled:opacity-50"
            style={{ background: '#658051' }}
          >
            {loading ? 'Mengirim...' : 'Pesan Sekarang →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading & Error ───────────────────────────────────
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F7F5' }}>
      <div className="text-center">
        <div className="text-5xl mb-4">☕</div>
        <p style={{ color: '#9CA38F' }}>Memuat menu...</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F7F7F5' }}>
      <div className="text-center">
        <div className="text-5xl mb-4">😕</div>
        <p style={{ color: '#6B7560' }}>{message}</p>
      </div>
    </div>
  );
}
