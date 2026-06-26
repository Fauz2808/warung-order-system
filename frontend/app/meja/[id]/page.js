'use client';
// app/meja/[id]/page.js
// Halaman utama customer — muncul saat scan QR meja

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getTable, getMenu, createOrder, getSettings, getOrderById, setPaymentLocation } from '@/lib/api';
import useCartStore from '@/store/cartStore';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';

const floorLabel = (floor) => {
  if (String(floor) === '1') return 'Outdoor';
  if (String(floor) === '2') return 'Indoor';
  return `Lantai ${floor}`;
};

// ─── Design tokens ────────────────────────────────────
// Primary: #1B4332 (earthy olive green)
const PRIMARY       = '#1B4332';
const PRIMARY_DARK  = '#2D6A4F';
const PRIMARY_LIGHT = '#D8F3DC';

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
  const [customerName, setCustomerName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayLoc, setSelectedPayLoc] = useState(null);

  const { items, addItem, removeItem, updateTemperature, getTotal, getTotalItems, clearCart, setTable } = useCartStore();
  const queryClient = useQueryClient();

  // Listen socket — warung buka/tutup otomatis, langsung refetch settings
  useEffect(() => {
    const socket = getSocket();
    socket.connect();
    socket.on('warung:status_changed', () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    });
    return () => {
      socket.off('warung:status_changed');
      socket.disconnect();
    };
  }, [queryClient]);

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

  const payLocMutation = useMutation({
    mutationFn: ({ id, loc }) => setPaymentLocation(id, loc),
    onSuccess: (_, { loc }) => {
      setSelectedPayLoc(loc);
      toast.success(loc === 'kasir' ? 'Oke, bayar di kasir ya!' : 'Siap, kami akan ke meja kamu!', { duration: 2500 });
    },
    onError: () => toast.error('Gagal menyimpan pilihan, coba lagi'),
  });

  const { data: liveOrder } = useQuery({
    queryKey: ['order', orderSuccess?.id],
    queryFn: () => getOrderById(orderSuccess.id),
    enabled: !!orderSuccess,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });

  const handleOrder = () => {
    if (items.length === 0) return;
    orderMutation.mutate({
      tableId: table?.id ?? tableId,
      orderType,
      customerName: customerName.trim() || undefined,
      paymentLocation: selectedPayLoc || undefined,
      items: items.map((i) => ({
        menuId: i.menuId,
        quantity: i.quantity,
        notes: [
          i.temperature ? (i.temperature === 'hot' ? '🔥 Hot' : '🧊 Ice') : null,
          i.additionalEspressoShots > 0 ? `+${i.additionalEspressoShots} Espresso Shot` : null,
          i.notes || null,
        ].filter(Boolean).join(' · ') || undefined,
        additionalEspressoShots: i.additionalEspressoShots || 0,
        additionalEspressoPrice: i.additionalEspressoPrice || 0,
        modifiers: (i.modifiers || []).map((m) => ({ optionId: m.optionId })),
      })),
    });
  };

  const getQuantity = (menuId) => items.find((i) => i.menuId === menuId)?.quantity || 0;

  const handleAddItem = (item) => setAddItemModal(item);

  const handleConfirmAdd = ({ temp, notes, additionalEspressoShots = 0, additionalEspressoPrice = 0, modifiers = [] }) => {
    if (!addItemModal) return;
    addItem({
      menuId: addItemModal.id,
      name: addItemModal.name,
      price: addItemModal.price,
      imageUrl: addItemModal.imageUrl,
      category: addItemModal.category,
      hasTemperatureOption: addItemModal.hasTemperatureOption || false,
      temperature: temp && temp !== 'none' ? temp.toLowerCase() : undefined,
      hasAdditionalEspresso: addItemModal.hasAdditionalEspresso || false,
      additionalEspressoShots,
      additionalEspressoPrice,
      notes: notes || '',
      modifiers,
    });
    setAddItemModal(null);
    toast.success(`${addItemModal.name} ditambahkan!`, { duration: 1500 });
  };

  const filteredMenu = menu
    .filter((m) => activeCategory === 'semua' || m.category === activeCategory)
    .filter((m) => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase()));

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
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F5EFE6' }}>
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-6xl mb-4">🌙</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#1A1A1A' }}>Warung Tutup</h2>
          <p className="text-sm mb-5" style={{ color: '#6B7280' }}>
            {shopSettings.isForceClose
              ? 'Warung sedang tutup sementara. Mohon maaf atas ketidaknyamanannya.'
              : 'Maaf, kami sedang tidak beroperasi saat ini.'}
          </p>
          <div className="rounded-2xl p-4 mb-5" style={{ background: PRIMARY_LIGHT }}>
            <p className="text-xs mb-1" style={{ color: '#6B7280' }}>Jam Operasional</p>
            <p className="text-2xl font-bold" style={{ color: PRIMARY }}>
              {shopSettings.openTime} – {shopSettings.closeTime}
            </p>
            <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>WIB · setiap hari</p>
          </div>
          <p className="text-xs" style={{ color: '#9CA3AF' }}>Halaman otomatis refresh saat warung buka ☕</p>
        </div>
      </div>
    );
  }

  // Order sukses — tracking screen
  if (orderSuccess) {
    const status = liveOrder?.status || orderSuccess.status || 'pending';
    const isDone = status === 'done';
    const isReady = status === 'ready';
    const stepIndex = { pending: 0, preparing: 1, ready: 2, done: 2 };
    const currentStep = stepIndex[status] ?? 0;

    const steps = [
      { label: 'Diterima', icon: '📋' },
      { label: 'Diproses', icon: '👨‍🍳' },
      { label: 'Siap',     icon: '🔔' },
    ];

    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F5EFE6' }}>
        <div className="bg-white rounded-3xl shadow-lg p-6 max-w-sm w-full">

          {/* Header */}
          <div className="text-center mb-6">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 text-3xl"
              style={{ background: isDone || isReady ? PRIMARY_LIGHT : '#FFF8EC' }}
            >
              {isDone || isReady ? '✓' : '☕'}
            </div>
            <h2 className="text-xl font-bold" style={{ color: '#1A1A1A' }}>
              {isDone || isReady ? 'Pesanan Siap!' : 'Pesanan Diterima!'}
            </h2>
            <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
              Order #{orderSuccess.id}
              {orderSuccess.customerName ? ` · ${orderSuccess.customerName}` : ''}
            </p>
            {!(isDone || isReady) && orderSuccess.estimatedMinutes && (
              <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: '#FFF8EC', color: '#92660A', border: '1px solid #FDE68A' }}>
                ⏱️ Estimasi siap ~{orderSuccess.estimatedMinutes} menit
              </div>
            )}
          </div>

          {/* Status steps */}
          <div className="relative flex items-start justify-between mb-6 px-1">
            {/* Background line */}
            <div className="absolute h-0.5" style={{ top: 18, left: 22, right: 22, background: '#E8ECE4', zIndex: 0 }} />
            {/* Progress line */}
            <div className="absolute h-0.5 transition-all duration-500"
              style={{
                top: 18, left: 22,
                width: `calc((100% - 44px) * ${currentStep / 2})`,
                background: PRIMARY, zIndex: 1,
              }}
            />
            {steps.map((step, i) => {
              const done = currentStep > i || ((isDone || isReady) && i === 2);
              const active = currentStep === i && !(isDone || isReady);
              return (
                <div key={i} className="flex flex-col items-center gap-1.5 relative z-10">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center border-2 text-sm"
                    style={{
                      background: done ? PRIMARY : active ? '#FFF8EC' : '#F5EFE6',
                      borderColor: done ? PRIMARY : active ? '#F59E0B' : '#E8ECE4',
                      color: done ? '#fff' : active ? '#92660A' : '#C4C9BD',
                    }}
                  >
                    {done ? '✓' : step.icon}
                  </div>
                  <p className="text-xs text-center leading-tight whitespace-nowrap" style={{ color: done || active ? '#1A1A1A' : '#C4C9BD' }}>
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Invoice */}
          <div className="rounded-2xl p-4 mb-4" style={{ background: '#F5EFE6' }}>
            <div className="flex justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Detail Pesanan</p>
              <p className="text-xs font-semibold" style={{ color: '#9CA3AF' }}>Meja {table?.number}</p>
            </div>
            <div className="space-y-2">
              {orderSuccess.items?.map((item) => (
                <div key={item.id}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: '#1A1A1A' }}>{item.quantity}× {item.menuName || item.menu?.name}</span>
                    <span style={{ color: '#6B7280' }}>{formatRupiah(item.price * item.quantity)}</span>
                  </div>
                  {item.notes && (
                    <p className="text-xs mt-0.5 px-2 py-0.5 rounded-full inline-block" style={{ background: '#FEF3C7', color: '#92400E' }}>
                      {item.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t mt-3 pt-3 flex justify-between" style={{ borderColor: '#E8ECE4' }}>
              <span className="font-bold text-sm" style={{ color: '#1A1A1A' }}>Total</span>
              <span className="font-bold text-sm" style={{ color: PRIMARY }}>{formatRupiah(orderSuccess.totalAmount)}</span>
            </div>
          </div>

          {isDone || isReady ? (
            <>
              <div className="text-center py-3 px-4 rounded-2xl mb-4" style={{ background: PRIMARY_LIGHT }}>
                <p className="font-semibold text-sm" style={{ color: PRIMARY }}>
                  Pesananmu sudah siap! Selamat menikmati ☕
                </p>
              </div>
              <button
                onClick={() => setOrderSuccess(null)}
                className="w-full py-3.5 rounded-2xl font-semibold text-white transition active:scale-95"
                style={{ background: PRIMARY }}
              >
                Pesan Lagi
              </button>
            </>
          ) : (
            <div className="space-y-3">
              {/* Konfirmasi lokasi bayar yang dipilih */}
              {(selectedPayLoc || liveOrder?.paymentLocation) && (
                <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
                  style={{ background: (selectedPayLoc || liveOrder?.paymentLocation) === 'meja' ? '#EDE9FE' : PRIMARY_LIGHT }}>
                  <span className="text-xl">{(selectedPayLoc || liveOrder?.paymentLocation) === 'meja' ? '🙋' : '🏪'}</span>
                  <div>
                    <p className="text-xs font-semibold"
                      style={{ color: (selectedPayLoc || liveOrder?.paymentLocation) === 'meja' ? '#7C3AED' : PRIMARY }}>
                      {(selectedPayLoc || liveOrder?.paymentLocation) === 'meja'
                        ? 'Bayar di Meja — kami akan ke mejamu'
                        : 'Bayar di Kasir — silakan ke kasir saat pesanan siap'}
                    </p>
                  </div>
                </div>
              )}
              <p className="text-center text-xs py-1" style={{ color: '#9CA3AF' }}>
                Mohon tunggu, kami sedang menyiapkan pesananmu ☕
                <br />
                <span style={{ color: '#C4C9BD' }}>Halaman ini otomatis update</span>
              </p>
              <button
                onClick={() => setOrderSuccess(null)}
                className="w-full py-3 rounded-2xl font-semibold text-sm transition active:scale-95 border-2"
                style={{ borderColor: PRIMARY, color: PRIMARY, background: 'transparent' }}
              >
                + Tambah Pesanan
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: '#F5EFE6' }}>

      {/* ── Header ─────────────────────────────────── */}
      <div className="px-4 pt-10 pb-5" style={{ background: '#F5EFE6' }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: PRIMARY }}>
              {shopSettings?.businessName || 'Warung Kita'}
            </p>
            <h1 className="text-3xl font-black" style={{ color: '#1A1A1A', letterSpacing: '-0.5px' }}>
              Meja {table?.number}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#9CA3AF' }}>
              {floorLabel(table?.floor)}
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

      {/* ── Search bar ──────────────────────────── */}
      <div className="px-4 pb-3">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base" style={{ color: '#9CA3AF' }}>🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari menu..."
            className="w-full pl-10 pr-10 py-3 rounded-2xl text-sm outline-none transition"
            style={{
              background: '#fff',
              border: `1.5px solid ${searchQuery ? PRIMARY : '#E8ECE4'}`,
              color: '#1A1A1A',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-xs"
              style={{ background: '#E8ECE4', color: '#6B7280' }}>
              ✕
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
                  color:      isActive ? '#fff' : '#6B7280',
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
          <div className="text-center py-16" style={{ color: '#9CA3AF' }}>
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
                needsTempChoice={item.hasTemperatureOption || false}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Cart bar ────────────────────────────── */}
      {getTotalItems() > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-6 pt-3" style={{ background: 'linear-gradient(to top, #F5EFE6 70%, transparent)' }}>
          <button
            onClick={() => setShowCart(true)}
            className="w-full rounded-2xl py-4 px-5 flex items-center justify-between shadow-lg transition active:scale-95"
            style={{ background: PRIMARY }}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: '#2D6A4F', color: '#fff' }}>
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
          needsTemp={addItemModal.hasTemperatureOption || false}
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
          onTempChange={updateTemperature}
          loading={orderMutation.isPending}
          menu={menu}
          orderType={orderType}
          setOrderType={setOrderType}
          customerName={customerName}
          setCustomerName={setCustomerName}
          paymentLoc={selectedPayLoc}
          setPaymentLoc={setSelectedPayLoc}
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
            style={{ background: '#1B4332' }}
          >
            {quantity}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-sm leading-tight mb-0.5 line-clamp-2" style={{ color: '#1A1A1A' }}>{item.name}</p>
        {item.description && (
          <p className="text-xs line-clamp-1 mb-1.5" style={{ color: '#9CA3AF' }}>{item.description}</p>
        )}
        <div className="flex items-center justify-between mt-2">
          <p className="font-bold text-sm" style={{ color: '#1B4332' }}>
            {formatRupiah(item.price)}
          </p>
          {!unavailable && (
            <div className="flex items-center gap-1.5">
              {quantity > 0 && (
                <button
                  onClick={onRemove}
                  className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-base transition"
                  style={{ background: '#D8F3DC', color: '#1B4332' }}
                >
                  −
                </button>
              )}
              <button
                onClick={onAdd}
                className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-base text-white transition"
                style={{ background: '#1B4332' }}
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
  const [selectedChips, setSelectedChips] = useState([]);
  const [customNote, setCustomNote] = useState('');
  const [espressoShots, setEspressoShots] = useState(0);
  // modifierSelections: { [groupId]: Set<optionId> }
  const [modifierSelections, setModifierSelections] = useState({});

  const modifierGroups = (item.modifierGroups || []).map((mg) => mg.group).filter(Boolean);

  const toggleModifierOption = (group, option) => {
    setModifierSelections((prev) => {
      const current = prev[group.id] ? new Set(prev[group.id]) : new Set();
      if (group.multiSelect) {
        current.has(option.id) ? current.delete(option.id) : current.add(option.id);
      } else {
        // single select — deselect if same, else replace
        if (current.has(option.id)) { current.clear(); } else { current.clear(); current.add(option.id); }
      }
      return { ...prev, [group.id]: current };
    });
  };

  // Cek semua required group sudah dipilih
  const requiredGroupsMet = modifierGroups
    .filter((g) => g.required)
    .every((g) => modifierSelections[g.id]?.size > 0);

  // Flatten semua selected options jadi array modifier
  const selectedModifiers = modifierGroups.flatMap((group) => {
    const selectedIds = modifierSelections[group.id] || new Set();
    return group.options
      .filter((o) => selectedIds.has(o.id))
      .map((o) => ({ optionId: o.id, groupName: group.name, optionName: o.name, priceAdd: o.priceAdd }));
  });

  const modifierExtra = selectedModifiers.reduce((s, m) => s + m.priceAdd, 0);

  // Gabungkan espresso note + chips aktif + custom note saat submit
  const espressoNote = espressoShots > 0 ? `+${espressoShots} Espresso Shot` : null;
  const combinedNotes = [espressoNote, selectedChips.join(', '), customNote.trim()].filter(Boolean).join(' · ');

  // Chips yang di-disable otomatis jika Hot dipilih
  const ICE_CHIPS = ['Less ice', 'No ice'];
  const isHot = selectedTemp === 'Hot';

  const toggleChip = (chip) => {
    // Jangan bisa klik jika chip ini di-disable karena Hot
    if (isHot && ICE_CHIPS.includes(chip)) return;
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  // Saat pilih Hot, auto-hapus ice chips yang mungkin sudah terpilih
  const handleTempSelect = (temp) => {
    setSelectedTemp(temp);
    if (temp === 'Hot') {
      setSelectedChips((prev) => prev.filter((c) => !ICE_CHIPS.includes(c)));
    }
  };

  const categoryEmoji = {
    'signature': '⭐', 'coffee': '☕', 'americano': '🫖',
    'slow-bar': '🔬', 'non-coffee': '🧋', 'foods': '🍟', 'additional': '➕'
  }[item.category] ?? '☕';
  const canConfirm = (!needsTemp || selectedTemp !== null) && requiredGroupsMet;
  const quickNotes = ['Less sugar', 'Less ice', 'No ice', 'Extra sweet', 'No sugar'];

  // Harga total dengan modifier
  const fmt = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  const totalPrice = item.price + modifierExtra + (espressoShots * (item.additionalEspressoPrice || 3000));

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
            <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center text-2xl" style={{ background: '#F5EFE6' }}>
              {item.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                : categoryEmoji}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight" style={{ color: '#1A1A1A' }}>{item.name}</h3>
              <p className="font-semibold mt-0.5" style={{ color: '#1B4332' }}>
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(item.price)}
              </p>
            </div>
          </div>

          {/* Hot / Ice */}
          {needsTemp && (
            <div className="mb-5">
              <p className="text-sm font-semibold mb-3" style={{ color: '#1A1A1A' }}>
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
                      onClick={() => handleTempSelect(opt.value)}
                      className="flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition active:scale-95"
                      style={{
                        borderColor: isActive ? opt.activeBorder : '#E8ECE4',
                        background:  isActive ? opt.activeBg : '#FAFAF8',
                        color:       isActive ? opt.activeColor : '#6B7280',
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

          {/* Additional Espresso Shot */}
          {item.hasAdditionalEspresso && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>Additional Espresso Shot</p>
                  <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>
                    +{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(item.additionalEspressoPrice || 3000)} per shot
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEspressoShots((s) => Math.max(0, s - 1))}
                    disabled={espressoShots === 0}
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg border-2 transition disabled:opacity-30"
                    style={{ borderColor: '#E8ECE4', color: '#1B4332' }}>
                    −
                  </button>
                  <span className="w-8 text-center font-bold text-lg" style={{ color: '#1A1A1A' }}>{espressoShots}</span>
                  <button
                    onClick={() => setEspressoShots((s) => Math.min(10, s + 1))}
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg border-2 transition"
                    style={{ borderColor: '#1B4332', background: '#D8F3DC', color: '#1B4332' }}>
                    +
                  </button>
                </div>
              </div>
              {espressoShots > 0 && (
                <div className="rounded-xl px-3 py-2 flex items-center justify-between"
                  style={{ background: '#D8F3DC' }}>
                  <span className="text-xs font-semibold" style={{ color: '#1B4332' }}>☕ {espressoShots} shot extra</span>
                  <span className="text-xs font-bold" style={{ color: '#1B4332' }}>
                    +{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(espressoShots * (item.additionalEspressoPrice || 3000))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Modifier Groups ── */}
          {modifierGroups.map((group) => (
            <div key={group.id} className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                <p className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>{group.name}</p>
                {group.required
                  ? <span className="text-xs font-semibold" style={{ color: '#DC2626' }}>* Wajib</span>
                  : <span className="text-xs" style={{ color: '#9CA3AF' }}>Opsional</span>}
                {group.multiSelect && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>Bisa pilih lebih dari 1</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.options.map((option) => {
                  const isSelected = modifierSelections[group.id]?.has(option.id);
                  return (
                    <button
                      key={option.id}
                      onClick={() => toggleModifierOption(group, option)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition active:scale-95 text-left"
                      style={{
                        borderColor: isSelected ? '#1B4332' : '#E8ECE4',
                        background: isSelected ? '#F0FDF4' : '#FAFAF8',
                      }}>
                      <span className="text-sm font-medium" style={{ color: isSelected ? '#1B4332' : '#374151' }}>{option.name}</span>
                      {option.priceAdd > 0 && (
                        <span className="text-xs font-semibold ml-1" style={{ color: isSelected ? '#1B4332' : '#9CA3AF' }}>
                          +{fmt(option.priceAdd)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Catatan */}
          <div className="mb-2">
            <p className="text-sm font-semibold mb-2" style={{ color: '#1A1A1A' }}>
              Catatan <span className="font-normal text-xs" style={{ color: '#9CA3AF' }}>(opsional)</span>
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {quickNotes.map((chip) => {
                const active = selectedChips.includes(chip);
                const disabled = isHot && ICE_CHIPS.includes(chip);
                return (
                  <button
                    key={chip}
                    onClick={() => toggleChip(chip)}
                    disabled={disabled}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition active:scale-95"
                    style={disabled
                      ? { background: '#F3F4F6', color: '#C4C9BD', borderColor: '#E5E7EB', cursor: 'not-allowed', textDecoration: 'line-through' }
                      : active
                      ? { background: '#D8F3DC', color: '#1B4332', borderColor: '#1B4332' }
                      : { background: '#FAFAF8', color: '#6B7280', borderColor: '#E8ECE4' }}
                  >
                    {disabled ? chip : active ? `✓ ${chip}` : `+ ${chip}`}
                  </button>
                );
              })}
            </div>
            <textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Catatan lain... (opsional)"
              rows={2}
              className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2"
              style={{
                border: '1.5px solid #E8ECE4',
                color: '#1A1A1A',
                '--tw-ring-color': '#1B4332',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-3 border-t" style={{ borderColor: '#F0F0EC' }}>
          <button
            onClick={() => onConfirm({
              temp: selectedTemp === 'none' ? '' : selectedTemp,
              notes: combinedNotes,
              additionalEspressoShots: espressoShots,
              additionalEspressoPrice: item.additionalEspressoPrice || 3000,
              modifiers: selectedModifiers,
            })}
            disabled={!canConfirm}
            className="w-full py-4 rounded-2xl font-bold text-base text-white transition disabled:opacity-40"
            style={{ background: '#1B4332' }}
          >
            {!canConfirm
              ? (needsTemp && !selectedTemp ? 'Pilih suhu dulu' : 'Pilih opsi yang wajib')
              : `Tambah ke Keranjang · ${fmt(totalPrice)}`}
          </button>
          <button onClick={onClose} className="w-full py-2 mt-1 text-sm" style={{ color: '#9CA3AF' }}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CartModal ────────────────────────────────────────
function CartModal({ items, total, onClose, onOrder, onAdd, onRemove, onTempChange, loading, menu, orderType, setOrderType, customerName, setCustomerName, paymentLoc, setPaymentLoc }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl max-h-[88vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F0F0EC' }}>
          <h2 className="text-lg font-bold" style={{ color: '#1A1A1A' }}>Pesanan Kamu</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition"
            style={{ background: '#F5EFE6', color: '#6B7280' }}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Dine In / Take Away */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#9CA3AF' }}>Tipe Pesanan</p>
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
                      borderColor: isActive ? '#1B4332' : '#E8ECE4',
                      background:  isActive ? '#D8F3DC' : 'transparent',
                      color:       isActive ? '#1B4332' : '#6B7280',
                    }}
                  >
                    <span>{opt.emoji}</span> {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cara Bayar */}
          <div style={{ borderTop: '1px solid #F0F0EC', paddingTop: '1rem' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#9CA3AF' }}>Cara Bayar</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'kasir', label: 'Bayar di Kasir', emoji: '🏪', desc: 'Kamu yang ke kasir' },
                { value: 'meja',  label: 'Bayar di Meja',  emoji: '🙋', desc: 'Kami yang ke mejamu' },
              ].map((opt) => {
                const isActive = paymentLoc === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setPaymentLoc(opt.value)}
                    className="flex flex-col items-center gap-0.5 py-3 rounded-xl border-2 transition"
                    style={{
                      borderColor: isActive ? PRIMARY : '#E8ECE4',
                      background:  isActive ? PRIMARY_LIGHT : 'transparent',
                    }}
                  >
                    <span className="text-xl">{opt.emoji}</span>
                    <span className="text-xs font-semibold" style={{ color: isActive ? PRIMARY : '#1A1A1A' }}>{opt.label}</span>
                    <span className="text-xs" style={{ color: '#9CA3AF' }}>{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nama Customer */}
          <div style={{ borderTop: '1px solid #F0F0EC', paddingTop: '1rem' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#9CA3AF' }}>Nama Kamu</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">👤</span>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Opsional — contoh: Budi"
                className="w-full pl-9 pr-4 py-3 rounded-xl text-sm outline-none border transition"
                style={{
                  border: '1.5px solid #E8ECE4',
                  color: '#1A1A1A',
                  background: '#FAFAF8',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = PRIMARY}
                onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'}
              />
            </div>
          </div>

          {/* Item list */}
          <div style={{ borderTop: '1px solid #F0F0EC', paddingTop: '1rem' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#9CA3AF' }}>Item</p>
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
                        <p className="font-semibold text-sm" style={{ color: '#1A1A1A' }}>{item.name}</p>
                        {tempNote === 'Ice' && (
                          <span className="text-xs bg-blue-50 text-blue-500 border border-blue-100 rounded-full px-1.5 py-0.5">🧊</span>
                        )}
                        {tempNote === 'Hot' && (
                          <span className="text-xs bg-red-50 text-red-400 border border-red-100 rounded-full px-1.5 py-0.5">♨️</span>
                        )}
                      </div>
                      {item.hasTemperatureOption && (
                        <div className="flex gap-1.5 mt-1.5">
                          {[{ v: 'hot', l: '🔥 Hot' }, { v: 'ice', l: '🧊 Ice' }].map((opt) => (
                            <button
                              key={opt.v}
                              type="button"
                              onClick={() => onTempChange(item.menuId, opt.v)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold border transition"
                              style={item.temperature === opt.v
                                ? { background: opt.v === 'hot' ? '#FEF3C7' : '#DBEAFE', color: opt.v === 'hot' ? '#92400E' : '#1E40AF', borderColor: opt.v === 'hot' ? '#FCD34D' : '#93C5FD' }
                                : { background: '#F5EFE6', color: '#9CA3AF', borderColor: '#E8ECE4' }}>
                              {opt.l}
                            </button>
                          ))}
                        </div>
                      )}
                      {otherNotes && (
                        <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>📝 {otherNotes}</p>
                      )}
                      {item.additionalEspressoShots > 0 && (
                        <p className="text-xs mt-0.5" style={{ color: '#1B4332' }}>
                          ☕ +{item.additionalEspressoShots} Espresso Shot (+{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(item.additionalEspressoShots * (item.additionalEspressoPrice || 3000))})
                        </p>
                      )}
                      <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{formatRupiah(item.price)} / item</p>
                    </div>
                    {/* Qty controls */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onRemove(item.menuId)}
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                        style={{ background: '#D8F3DC', color: '#1B4332' }}
                      >−</button>
                      <span className="w-5 text-center font-semibold text-sm" style={{ color: '#1A1A1A' }}>{item.quantity}</span>
                      <button
                        onClick={() => menuData && onAdd(menuData)}
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm text-white"
                        style={{ background: '#1B4332' }}
                      >+</button>
                    </div>
                    <p className="w-16 text-right font-semibold text-sm flex-shrink-0" style={{ color: '#1A1A1A' }}>
                      {formatRupiah((item.price + (item.additionalEspressoShots || 0) * (item.additionalEspressoPrice || 0)) * item.quantity)}
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
            <span className="font-medium" style={{ color: '#6B7280' }}>Total</span>
            <span className="text-xl font-black" style={{ color: '#1A1A1A' }}>{formatRupiah(total)}</span>
          </div>
          <button
            onClick={onOrder}
            disabled={loading}
            className="w-full py-4 rounded-2xl font-bold text-base text-white transition disabled:opacity-50"
            style={{ background: '#1B4332' }}
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5EFE6' }}>
      <div className="text-center">
        <div className="text-5xl mb-4">☕</div>
        <p style={{ color: '#9CA3AF' }}>Memuat menu...</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F5EFE6' }}>
      <div className="text-center">
        <div className="text-5xl mb-4">😕</div>
        <p style={{ color: '#6B7280' }}>{message}</p>
      </div>
    </div>
  );
}
