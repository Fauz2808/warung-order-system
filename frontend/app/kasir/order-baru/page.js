'use client';
// app/kasir/order-baru/page.js
// POS sederhana — kasir input order manual untuk customer walk-in / counter

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getMenu, getTables, createOrder, getCategories, markOrderPaid } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import StaffLayout from '@/components/StaffLayout';

const formatRupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

export default function OrderBaruPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { loading } = useAuth();

  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState('semua');
  const [search, setSearch] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [orderType, setOrderType] = useState('dine-in');
  const [orderNotes, setOrderNotes] = useState('');
  const [noteModal, setNoteModal] = useState(null);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [payNow, setPayNow] = useState(true);
  // AddItemModal state
  const [addItemModal, setAddItemModal] = useState(null); // { item } or null

  const { data: menu = [], isLoading: loadingMenu } = useQuery({
    queryKey: ['menu'],
    queryFn: getMenu,
    enabled: !loading,
  });

  const { data: tables = [], isLoading: loadingTables } = useQuery({
    queryKey: ['tables'],
    queryFn: getTables,
    enabled: !loading,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    enabled: !loading,
  });

  // Helper: emoji untuk menu list
  const getCatEmoji = (slug) => categories.find((c) => c.slug === slug)?.emoji ?? '☕';

  const orderMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(`Order #${res.data.id} berhasil dibuat! 🎉`);
      router.push('/kasir');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal membuat order');
    },
  });

  if (loading) return null;

  // ── Cart helpers ──────────────────────────────────
  const addToCart = (item, opts = {}) => {
    const { temperature, additionalEspressoShots = 0, additionalEspressoPrice, notes = '' } = opts;
    setCart((prev) => {
      // If item has options, always add as new entry (different shots/temp may differ)
      // For simple items, increment existing
      const needsOptions = item.hasTemperatureOption || item.hasAdditionalEspresso;
      if (!needsOptions) {
        const existing = prev.find((i) => i.menuId === item.id);
        if (existing) return prev.map((i) => i.menuId === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        menuId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        notes,
        hasTemperatureOption: item.hasTemperatureOption || false,
        temperature: temperature ?? (item.hasTemperatureOption ? 'Ice' : undefined),
        hasAdditionalEspresso: item.hasAdditionalEspresso || false,
        additionalEspressoShots,
        additionalEspressoPrice: additionalEspressoPrice ?? (item.additionalEspressoPrice || 3000),
      }];
    });
  };

  // handleAddItem — always open modal so kasir can add notes
  const handleAddItem = (item) => {
    setAddItemModal({ item });
  };

  // handleIncrementItem — always open modal so kasir can add notes
  const handleIncrementItem = (item) => {
    setAddItemModal({ item });
  };

  const removeFromCart = (cartIdx) => {
    setCart((prev) => {
      const item = prev[cartIdx];
      if (!item) return prev;
      if (item.quantity === 1) return prev.filter((_, i) => i !== cartIdx);
      return prev.map((i, idx) => idx === cartIdx ? { ...i, quantity: i.quantity - 1 } : i);
    });
  };

  const removeFromCartByMenuId = (menuId) => {
    setCart((prev) => {
      // Find last occurrence and decrement / remove
      const lastIdx = [...prev].map((i, idx) => i.menuId === menuId ? idx : -1).filter((i) => i !== -1).pop();
      if (lastIdx === undefined) return prev;
      const item = prev[lastIdx];
      if (item.quantity === 1) return prev.filter((_, i) => i !== lastIdx);
      return prev.map((i, idx) => idx === lastIdx ? { ...i, quantity: i.quantity - 1 } : i);
    });
  };

  const updateItemNotes = (cartIdx, notes) =>
    setCart((prev) => prev.map((i, idx) => idx === cartIdx ? { ...i, notes } : i));

  const clearCart = () => setCart([]);

  // Total qty per menuId (for list display)
  const getQty = (menuId) => cart.filter((i) => i.menuId === menuId).reduce((s, i) => s + i.quantity, 0);

  const totalAmount = cart.reduce((sum, i) => {
    const espressoExtra = (i.additionalEspressoShots || 0) * (i.additionalEspressoPrice || 0);
    return sum + (i.price + espressoExtra) * i.quantity;
  }, 0);
  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0);

  // ── Filter menu ───────────────────────────────────
  const activeSlugs = new Set(menu.map((m) => m.category));
  const filteredCategories = categories.filter((c) => activeSlugs.has(c.slug));

  const filtered = menu.filter((m) => {
    const catMatch = activeCategory === 'semua' || m.category === activeCategory;
    const searchMatch = !search || m.name.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

  // Stok helpers
  const isOutOfStock  = (item) => item.stock !== null && item.stock <= 0;
  const isLowStock    = (item) => item.stock !== null && item.stock > 0 && item.stock <= 5;
  const hasStockLimit = (item) => item.stock !== null;

  // ── Validasi item keranjang vs menu data saat ini ─
  const getCartItemStatus = (cartItem) => {
    const menuItem = menu.find((m) => m.id === cartItem.menuId);
    if (!menuItem) return { valid: false, reason: 'Menu tidak ditemukan' };
    if (!menuItem.isAvailable) return { valid: false, reason: 'Menu tidak tersedia' };
    if (menuItem.stock !== null && menuItem.stock <= 0) return { valid: false, reason: 'Stok habis' };
    if (menuItem.stock !== null && menuItem.stock < cartItem.quantity)
      return { valid: false, reason: `Stok tidak cukup (sisa ${menuItem.stock})` };
    return { valid: true, reason: null };
  };
  const hasInvalidCartItems = cart.some((i) => !getCartItemStatus(i).valid);

  // ── Validasi sebelum ke payment ───────────────────
  const handleSubmit = () => {
    if (cart.length === 0) { toast.error('Keranjang kosong!'); return; }
    if (hasInvalidCartItems) return; // tombol sudah disabled, tapi guard tetap

    if (!payNow) {
      const tableId = orderType === 'take-away' || !selectedTable ? (tables[0]?.id || 1) : parseInt(selectedTable);
      orderMutation.mutate({
        tableId,
        orderType,
        customerName: customerName.trim() || undefined,
        isPaid: false,
        notes: orderNotes || undefined,
        items: cart.map((i) => ({
          menuId: i.menuId,
          quantity: i.quantity,
          notes: [
            i.temperature ? (i.temperature === 'Hot' ? '🔥 Hot' : '🧊 Ice') : null,
            i.additionalEspressoShots > 0 ? `+${i.additionalEspressoShots} Espresso Shot` : null,
            i.notes || null,
          ].filter(Boolean).join(' · ') || undefined,
          additionalEspressoShots: i.additionalEspressoShots || 0,
          additionalEspressoPrice: i.additionalEspressoPrice || 0,
        })),
      });
      setShowCartDrawer(false);
      return;
    }

    setShowCartDrawer(false);
    setShowPayment(true);
  };

  // ── Final submit setelah payment confirmed ────────
  const handleConfirmPayment = (paymentMethod, receivedAmount) => {
    const tableId = orderType === 'take-away' || !selectedTable ? (tables[0]?.id || 1) : parseInt(selectedTable);
    const paymentNote = paymentMethod === 'cash'
      ? `[Bayar Cash: ${formatRupiah(receivedAmount)}, Kembalian: ${formatRupiah(receivedAmount - totalAmount)}]`
      : '[Bayar QRIS]';
    const finalNotes = [orderNotes, paymentNote].filter(Boolean).join(' · ');

    orderMutation.mutate({
      tableId,
      orderType,
      customerName: customerName.trim() || undefined,
      isPaid: true,
      notes: finalNotes || undefined,
      items: cart.map((i) => ({
        menuId: i.menuId,
        quantity: i.quantity,
        notes: [
          i.temperature ? (i.temperature === 'Hot' ? '🔥 Hot' : '🧊 Ice') : null,
          i.additionalEspressoShots > 0 ? `+${i.additionalEspressoShots} Espresso Shot` : null,
          i.notes || null,
        ].filter(Boolean).join(' · ') || undefined,
        additionalEspressoShots: i.additionalEspressoShots || 0,
        additionalEspressoPrice: i.additionalEspressoPrice || 0,
      })),
    });
    setShowPayment(false);
  };

  // ── Cart item summary badge ───────────────────────
  const getItemSummaryBadge = (item) => {
    const parts = [];
    if (item.temperature) parts.push(item.temperature === 'Hot' ? '🔥 Hot' : '🧊 Ice');
    if ((item.additionalEspressoShots || 0) > 0) parts.push(`+${item.additionalEspressoShots} Shot`);
    // Quick-note chips from notes field (chips joined by comma, before any '·')
    const notesBefore = item.notes?.split(' · ')[0];
    if (notesBefore) parts.push(notesBefore);
    return parts.join(' · ');
  };

  // ── Order panel JSX ──────────────────────────────
  const orderPanelJSX = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between" style={{ borderColor: '#E8ECE4' }}>
        <h2 className="font-bold text-sm" style={{ color: '#1C1C1A' }}>📋 Pesanan</h2>
        <button
          onClick={() => setShowCartDrawer(false)}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full"
          style={{ background: '#F7F7F5', color: '#6B7560' }}
        >✕</button>
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="text-center py-10" style={{ color: '#9CA38F' }}>
            <p className="text-3xl mb-2">🛒</p>
            <p className="text-sm">Belum ada item</p>
            <p className="text-xs mt-1">Pilih menu di sebelah kiri</p>
          </div>
        ) : (
          cart.map((item, cartIdx) => {
            const summaryBadge = getItemSummaryBadge(item);
            const status = getCartItemStatus(item);
            const isInvalid = !status.valid;
            return (
              <div key={cartIdx} className="rounded-xl p-3 border" style={{
                background: isInvalid ? '#FEF2F2' : '#FAFAF8',
                borderColor: isInvalid ? '#FCA5A5' : '#E8ECE4',
              }}>
                {/* Invalid warning banner */}
                {isInvalid && (
                  <div className="flex items-center justify-between mb-2 px-2 py-1 rounded-lg" style={{ background: '#FEE2E2' }}>
                    <span className="text-xs font-semibold" style={{ color: '#DC2626' }}>
                      ⚠️ {item.name}: {status.reason}
                    </span>
                    <button onClick={() => removeFromCart(cartIdx)}
                      className="text-xs font-bold ml-2 shrink-0 underline" style={{ color: '#DC2626' }}>
                      Hapus
                    </button>
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: isInvalid ? '#DC2626' : '#1C1C1A' }}>{item.name}</p>
                    <p className="text-xs" style={{ color: isInvalid ? '#FCA5A5' : '#658051' }}>
                      {formatRupiah((item.price + (item.additionalEspressoShots || 0) * (item.additionalEspressoPrice || 0)) * item.quantity)}
                    </p>
                    {/* Summary badge: temp + espresso + chips */}
                    {summaryBadge ? (
                      <p className="text-xs mt-0.5 truncate" style={{ color: '#9CA38F' }}>{summaryBadge}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => removeFromCart(cartIdx)}
                      className="w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center"
                      style={{ background: '#FEE2E2', color: '#DC2626' }}>−</button>
                    <span className="text-sm font-bold w-5 text-center" style={{ color: '#1C1C1A' }}>{item.quantity}</span>
                    <button
                      onClick={() => {
                        const m = menu.find((x) => x.id === item.menuId);
                        if (m) handleIncrementItem(m);
                      }}
                      disabled={isInvalid}
                      className="w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center text-white disabled:opacity-30"
                      style={{ background: '#658051' }}>+</button>
                  </div>
                </div>
                {/* Notes row */}
                {item.notes ? (
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-xs px-2 py-0.5 rounded-full truncate max-w-[160px]" style={{ background: '#FEF3C7', color: '#92400E' }}>
                      ⚠️ {item.notes}
                    </p>
                    <button onClick={() => setNoteModal({ cartIdx, menuId: item.menuId, name: item.name, currentNote: item.notes })}
                      className="text-xs underline ml-2 shrink-0" style={{ color: '#9CA38F' }}>edit</button>
                  </div>
                ) : (
                  <button onClick={() => setNoteModal({ cartIdx, menuId: item.menuId, name: item.name, currentNote: '' })}
                    className="text-xs mt-1.5" style={{ color: '#9CA38F' }}>
                    + tambah catatan
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Settings */}
      <div className="overflow-y-auto px-4 pt-3 pb-2 space-y-3 shrink-0 border-t" style={{ borderColor: '#E8ECE4', maxHeight: '55%' }}>
        {/* Order type */}
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: '#6B7560' }}>Tipe Pesanan</p>
          <div className="grid grid-cols-2 gap-2">
            {[{ value: 'dine-in', label: '🪑 Dine In' }, { value: 'take-away', label: '🥡 Take Away' }].map((opt) => (
              <button key={opt.value}
                onClick={() => { setOrderType(opt.value); if (opt.value === 'take-away') setSelectedTable(''); }}
                className="py-2 rounded-xl text-xs font-semibold border transition"
                style={orderType === opt.value
                  ? { background: '#658051', color: '#fff', borderColor: '#658051' }
                  : { background: '#FAFAF8', color: '#6B7560', borderColor: '#E8ECE4' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pilih meja */}
        {orderType === 'dine-in' && (
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#6B7560' }}>
              Nomor Meja <span className="font-normal" style={{ color: '#9CA38F' }}>(opsional)</span>
            </p>
            {loadingTables ? <p className="text-xs" style={{ color: '#9CA38F' }}>Memuat...</p> : (
              <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none border"
                style={{ border: '1px solid #E8ECE4', color: selectedTable ? '#1C1C1A' : '#9CA38F', background: '#FAFAF8' }}>
                <option value="">-- Belum ditentukan --</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>Meja {t.number} · Lantai {t.floor}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Nama Customer */}
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: '#6B7560' }}>
            Nama Customer <span className="font-normal" style={{ color: '#9CA38F' }}>(opsional)</span>
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">👤</span>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Contoh: Budi, Meja VIP..."
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none border transition"
              style={{ border: '1px solid #E8ECE4', color: '#1C1C1A', background: '#FAFAF8' }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'}
            />
          </div>
        </div>

        {/* Opsi Pembayaran */}
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: '#6B7560' }}>Pembayaran</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: true,  label: '💳 Bayar Sekarang', desc: 'Cash / QRIS' },
              { value: false, label: '⏳ Bayar Nanti',    desc: 'Catat dulu' },
            ].map((opt) => (
              <button key={String(opt.value)}
                onClick={() => setPayNow(opt.value)}
                className="py-2 px-2.5 rounded-xl border-2 text-left transition"
                style={payNow === opt.value
                  ? { borderColor: '#658051', background: '#EDF1EA' }
                  : { borderColor: '#E8ECE4', background: '#FAFAF8' }}>
                <p className="font-bold text-xs" style={{ color: payNow === opt.value ? '#658051' : '#1C1C1A' }}>{opt.label}</p>
                <p className="text-xs mt-0.5" style={{ color: '#9CA38F' }}>{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Catatan order */}
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: '#6B7560' }}>
            Catatan <span className="font-normal" style={{ color: '#9CA38F' }}>(opsional)</span>
          </p>
          <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="Contoh: minta kursi dekat jendela..." rows={2}
            className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none border transition"
            style={{ border: '1px solid #E8ECE4', color: '#1C1C1A', background: '#FAFAF8' }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'} />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 pt-3 space-y-2 shrink-0 border-t" style={{ borderColor: '#E8ECE4' }}>
        {cart.length > 0 && (
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold" style={{ color: '#6B7560' }}>Total</span>
            <span className="text-lg font-bold" style={{ color: '#658051' }}>{formatRupiah(totalAmount)}</span>
          </div>
        )}
        {hasInvalidCartItems && (
          <p className="text-xs text-center font-medium mb-1" style={{ color: '#DC2626' }}>
            ⚠️ Hapus menu yang tidak tersedia dulu
          </p>
        )}
        <button onClick={handleSubmit}
          disabled={cart.length === 0 || orderMutation.isPending || hasInvalidCartItems}
          className="w-full py-3 rounded-xl font-bold text-sm text-white transition disabled:opacity-40"
          style={{ background: hasInvalidCartItems ? '#DC2626' : payNow ? '#658051' : '#6B7560' }}
          onMouseEnter={(e) => { if (cart.length > 0 && !hasInvalidCartItems) e.currentTarget.style.background = payNow ? '#4d6340' : '#4b5563'; }}
          onMouseLeave={(e) => e.currentTarget.style.background = hasInvalidCartItems ? '#DC2626' : payNow ? '#658051' : '#6B7560'}>
          {orderMutation.isPending
            ? 'Membuat order...'
            : hasInvalidCartItems ? '⚠️ Ada menu tidak tersedia'
            : payNow ? '💳 Lanjut ke Pembayaran →' : '⏳ Catat Order (Bayar Nanti)'}
        </button>
        {cart.length > 0 && (
          <button onClick={clearCart}
            className="w-full py-2 rounded-xl text-xs font-medium border transition"
            style={{ borderColor: '#FCA5A5', color: '#DC2626' }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#FEF2F2'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            🗑️ Kosongkan Keranjang
          </button>
        )}
      </div>
    </div>
  );

  return (
    <StaffLayout>
      <div className="h-screen flex flex-col" style={{ background: '#F7F7F5' }}>

        {/* ── Top bar ─────────────────────────────── */}
        <div className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ borderColor: '#E8ECE4' }}>
          <button onClick={() => router.push('/kasir')}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl transition shrink-0"
            style={{ color: '#6B7560' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF1EA'; e.currentTarget.style.color = '#658051'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7560'; }}>
            ← <span className="hidden sm:inline">Kembali</span>
          </button>
          <div className="w-px h-5 bg-gray-200 shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm sm:text-base truncate" style={{ color: '#1C1C1A' }}>Buat Order Baru</h1>
            <p className="text-xs hidden sm:block" style={{ color: '#9CA38F' }}>Input pesanan manual dari kasir</p>
          </div>
          {totalItems > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl shrink-0"
              style={{ background: '#EDF1EA' }}>
              <span className="text-xs sm:text-sm font-bold" style={{ color: '#658051' }}>
                {totalItems} item · {formatRupiah(totalAmount)}
              </span>
            </div>
          )}
        </div>

        {/* ── Main content ─────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ── LEFT: Menu panel */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {/* Search + category tabs */}
            <div className="bg-white border-b px-3 sm:px-4 py-3 space-y-2 shrink-0" style={{ borderColor: '#E8ECE4' }}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🔍</span>
                <input type="text" placeholder="Cari menu..." value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none border transition"
                  style={{ border: '1px solid #E8ECE4', color: '#1C1C1A', background: '#FAFAF8' }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'} />
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                <button onClick={() => setActiveCategory('semua')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0"
                  style={activeCategory === 'semua'
                    ? { background: '#658051', color: '#fff' }
                    : { background: '#F7F7F5', color: '#6B7560' }}>
                  Semua
                </button>
                {filteredCategories.map((cat) => (
                  <button key={cat.slug} onClick={() => setActiveCategory(cat.slug)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0"
                    style={activeCategory === cat.slug
                      ? { background: '#658051', color: '#fff' }
                      : { background: '#F7F7F5', color: '#6B7560' }}>
                    {cat.emoji} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Menu list (compact vertical) */}
            <div className="flex-1 overflow-y-auto pb-32 lg:pb-4">
              {loadingMenu ? (
                <div className="text-center py-12" style={{ color: '#9CA38F' }}><p>Memuat menu...</p></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12" style={{ color: '#9CA38F' }}>
                  <p className="text-3xl mb-2">🔍</p><p>Menu tidak ditemukan</p>
                </div>
              ) : (
                <div>
                  {filtered.map((item, idx) => {
                    const qty         = getQty(item.id);
                    const unavailable = !item.isAvailable;
                    const outStock    = isOutOfStock(item);
                    const lowStock    = isLowStock(item);
                    const hasLimit    = hasStockLimit(item);
                    const remaining   = hasLimit ? item.stock - qty : null;
                    const atMax       = hasLimit && qty >= item.stock;
                    const disabled    = unavailable || outStock;
                    const isLast      = idx === filtered.length - 1;

                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 px-4 py-3"
                        style={{
                          borderBottom: isLast ? 'none' : '1px solid #E8ECE4',
                          background: '#fff',
                          opacity: disabled ? 0.55 : 1,
                        }}
                      >
                        {/* Left: emoji + name + price */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-2xl shrink-0" style={{ filter: disabled ? 'grayscale(1)' : 'none' }}>
                            {getCatEmoji(item.category)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm leading-tight truncate" style={{ color: disabled ? '#9CA38F' : '#1C1C1A' }}>
                              {item.name}
                            </p>
                            <p className="text-xs font-semibold mt-0.5" style={{ color: disabled ? '#9CA38F' : '#658051' }}>
                              {formatRupiah(item.price)}
                            </p>
                          </div>
                        </div>

                        {/* Right: stock badge + quantity controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Stock badge */}
                          {!disabled && hasLimit && (
                            <span
                              className="text-xs font-semibold px-1.5 py-0.5 rounded-md"
                              style={
                                atMax    ? { background: '#FEF3C7', color: '#92400E' } :
                                lowStock ? { background: '#FEE2E2', color: '#DC2626' } :
                                           { background: '#EDF1EA', color: '#658051' }
                              }
                            >
                              {atMax ? 'Maks!' : `Sisa ${remaining}`}
                            </span>
                          )}

                          {/* Controls */}
                          {unavailable ? (
                            <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: '#F3F4F6', color: '#9CA38F' }}>
                              Tidak Tersedia
                            </span>
                          ) : outStock ? (
                            <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                              Stok Habis
                            </span>
                          ) : qty === 0 ? (
                            <button
                              onClick={() => handleAddItem(item)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition"
                              style={{ background: '#658051' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#4d6340'}
                              onMouseLeave={(e) => e.currentTarget.style.background = '#658051'}
                            >
                              + Tambah
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => removeFromCartByMenuId(item.id)}
                                className="w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center"
                                style={{ background: '#FEE2E2', color: '#DC2626' }}
                              >−</button>
                              <span
                                className="text-sm font-bold w-5 text-center"
                                style={{ color: atMax ? '#D97706' : '#1C1C1A' }}
                              >
                                {qty}
                              </span>
                              <button
                                onClick={() => handleIncrementItem(item)}
                                disabled={atMax}
                                className="w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center text-white disabled:opacity-30"
                                style={{ background: atMax ? '#D97706' : '#658051' }}
                              >+</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Order panel — desktop only */}
          <div className="hidden lg:flex w-80 xl:w-96 shrink-0 flex-col bg-white border-l"
            style={{ borderColor: '#E8ECE4' }}>
            {orderPanelJSX}
          </div>
        </div>

        {/* ── Mobile: floating cart button ────────── */}
        {totalItems > 0 && (
          <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 z-20"
            style={{ background: 'linear-gradient(to top, #F7F7F5 60%, transparent)' }}>
            <button onClick={() => setShowCartDrawer(true)}
              className="w-full py-4 rounded-2xl font-bold text-sm text-white flex items-center justify-between px-5 shadow-lg"
              style={{ background: '#658051' }}>
              <span className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-xs font-bold"
                style={{ color: '#658051' }}>{totalItems}</span>
              <span>Lihat Pesanan</span>
              <span className="font-bold">{formatRupiah(totalAmount)}</span>
            </button>
          </div>
        )}

        {/* ── Mobile: cart drawer ──────────────────── */}
        {showCartDrawer && (
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowCartDrawer(false)} />
            <div className="relative bg-white rounded-t-3xl flex flex-col"
              style={{ maxHeight: '90vh' }}>
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {orderPanelJSX}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal catatan item ─────────────────────── */}
      {noteModal && (
        <NoteModal
          item={noteModal}
          onSave={(notes) => {
            updateItemNotes(noteModal.cartIdx, notes);
            setNoteModal(null);
          }}
          onClose={() => setNoteModal(null)}
        />
      )}

      {/* ── AddItemModal ───────────────────────────── */}
      {addItemModal && (
        <AddItemModal
          item={addItemModal.item}
          needsTemp={!!addItemModal.item.hasTemperatureOption}
          onConfirm={(opts) => {
            addToCart(addItemModal.item, {
              temperature: opts.temp || undefined,
              additionalEspressoShots: opts.additionalEspressoShots,
              additionalEspressoPrice: opts.additionalEspressoPrice,
              notes: opts.notes,
            });
            setAddItemModal(null);
          }}
          onClose={() => setAddItemModal(null)}
        />
      )}

      {/* ── Modal pembayaran ───────────────────────── */}
      {showPayment && (
        <PaymentModal
          totalAmount={totalAmount}
          onConfirm={handleConfirmPayment}
          onClose={() => setShowPayment(false)}
          isPending={orderMutation.isPending}
        />
      )}
    </StaffLayout>
  );
}

// ─── AddItemModal (bottom sheet) ─────────────────────
function AddItemModal({ item, needsTemp, onConfirm, onClose }) {
  const [selectedTemp, setSelectedTemp] = useState(needsTemp ? null : 'none');
  const [selectedChips, setSelectedChips] = useState([]);
  const [customNote, setCustomNote] = useState('');
  const [espressoShots, setEspressoShots] = useState(0);

  const espressoNote = espressoShots > 0 ? `+${espressoShots} Espresso Shot` : null;
  const combinedNotes = [espressoNote, selectedChips.join(', '), customNote.trim()].filter(Boolean).join(' · ');

  const ICE_CHIPS = ['Less ice', 'No ice'];
  const isHot = selectedTemp === 'Hot';

  const toggleChip = (chip) => {
    if (isHot && ICE_CHIPS.includes(chip)) return;
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  const handleTempSelect = (temp) => {
    setSelectedTemp(temp);
    if (temp === 'Hot') {
      setSelectedChips((prev) => prev.filter((c) => !ICE_CHIPS.includes(c)));
    }
  };

  const canConfirm = !needsTemp || selectedTemp !== null;
  const quickNotes = ['Less sugar', 'Less ice', 'No ice', 'Extra sweet', 'No sugar'];

  const fmt = (n) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  return (
    <div className="fixed inset-0 z-40 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="overflow-y-auto px-5 pb-5 pt-2 flex-1">
          {/* Item info */}
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center text-2xl"
              style={{ background: '#F7F7F5' }}
            >
              {item.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                : '☕'}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight" style={{ color: '#1C1C1A' }}>{item.name}</h3>
              <p className="font-semibold mt-0.5" style={{ color: '#658051' }}>{fmt(item.price)}</p>
            </div>
          </div>

          {/* Hot / Ice selector */}
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
                      onClick={() => handleTempSelect(opt.value)}
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

          {/* Additional Espresso Shot */}
          {item.hasAdditionalEspresso && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#1C1C1A' }}>Additional Espresso Shot</p>
                  <p className="text-xs mt-0.5" style={{ color: '#9CA38F' }}>
                    +{fmt(item.additionalEspressoPrice || 3000)} per shot
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEspressoShots((s) => Math.max(0, s - 1))}
                    disabled={espressoShots === 0}
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg border-2 transition disabled:opacity-30"
                    style={{ borderColor: '#E8ECE4', color: '#658051' }}>
                    −
                  </button>
                  <span className="w-8 text-center font-bold text-lg" style={{ color: '#1C1C1A' }}>{espressoShots}</span>
                  <button
                    onClick={() => setEspressoShots((s) => Math.min(10, s + 1))}
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg border-2 transition"
                    style={{ borderColor: '#658051', background: '#EDF1EA', color: '#658051' }}>
                    +
                  </button>
                </div>
              </div>
              {espressoShots > 0 && (
                <div className="rounded-xl px-3 py-2 flex items-center justify-between" style={{ background: '#EDF1EA' }}>
                  <span className="text-xs font-semibold" style={{ color: '#658051' }}>☕ {espressoShots} shot extra</span>
                  <span className="text-xs font-bold" style={{ color: '#658051' }}>
                    +{fmt(espressoShots * (item.additionalEspressoPrice || 3000))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Catatan / quick chips */}
          <div className="mb-2">
            <p className="text-sm font-semibold mb-2" style={{ color: '#1C1C1A' }}>
              Catatan <span className="font-normal text-xs" style={{ color: '#9CA38F' }}>(opsional)</span>
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {quickNotes.map((chip) => {
                const active   = selectedChips.includes(chip);
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
                      ? { background: '#EDF1EA', color: '#658051', borderColor: '#658051' }
                      : { background: '#FAFAF8', color: '#6B7560', borderColor: '#E8ECE4' }}
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
              className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none border"
              style={{ border: '1.5px solid #E8ECE4', color: '#1C1C1A' }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-3 border-t shrink-0" style={{ borderColor: '#F0F0EC' }}>
          <button
            onClick={() => onConfirm({
              temp: selectedTemp === 'none' ? '' : selectedTemp,
              notes: combinedNotes,
              additionalEspressoShots: espressoShots,
              additionalEspressoPrice: item.additionalEspressoPrice || 3000,
            })}
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

// ─── Modal Pembayaran ────────────────────────────────
function PaymentModal({ totalAmount, onConfirm, onClose, isPending }) {
  const [method, setMethod]           = useState('cash');
  const [receivedRaw, setReceivedRaw] = useState('');

  const fmt = (n) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  const received   = parseInt(receivedRaw, 10) || 0;
  const change     = received - totalAmount;
  const canConfirm = method === 'qris' || (method === 'cash' && received >= totalAmount);

  const padPress = (key) => {
    if (key === '⌫') {
      setReceivedRaw((p) => p.slice(0, -1));
    } else if (key === 'C') {
      setReceivedRaw('');
    } else {
      setReceivedRaw((p) => {
        const next = p + key;
        return next.length > 10 ? p : next;
      });
    }
  };

  const quickAmounts = (() => {
    const denoms = [5000, 10000, 20000, 50000, 100000, 200000, 500000];
    const result = new Set();
    result.add(totalAmount);
    for (const d of denoms) {
      const rounded = Math.ceil(totalAmount / d) * d;
      result.add(rounded);
      if (result.size >= 4) break;
    }
    return [...result].sort((a, b) => a - b).slice(0, 4);
  })();

  const NUMPAD_ROWS = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['C','0','⌫'],
  ];
  const NUMPAD_ZEROS = ['00','000'];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden"
        style={{ maxHeight: '96vh' }}>

        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(96vh - 12px)' }}>

          <div className="px-4 pt-3 pb-3 flex items-center justify-between border-b" style={{ borderColor: '#E8ECE4' }}>
            <div>
              <h3 className="font-bold text-base" style={{ color: '#1C1C1A' }}>💳 Pembayaran</h3>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-sm"
              style={{ background: '#F7F7F5', color: '#6B7560' }}>✕</button>
          </div>

          <div className="px-4 pt-3 pb-4 space-y-3">

            <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: '#EDF1EA' }}>
              <p className="text-xs font-semibold" style={{ color: '#6B7560' }}>Total Tagihan</p>
              <p className="text-xl font-bold" style={{ color: '#658051' }}>{fmt(totalAmount)}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'cash', label: '💵 Cash',  desc: 'Bayar tunai' },
                { value: 'qris', label: '📱 QRIS',  desc: 'Scan QR code' },
              ].map((opt) => (
                <button key={opt.value}
                  onClick={() => { setMethod(opt.value); setReceivedRaw(''); }}
                  className="py-2.5 px-3 rounded-xl border-2 text-left transition"
                  style={method === opt.value
                    ? { borderColor: '#658051', background: '#EDF1EA' }
                    : { borderColor: '#E8ECE4', background: '#FAFAF8' }}>
                  <p className="font-bold text-sm" style={{ color: method === opt.value ? '#658051' : '#1C1C1A' }}>{opt.label}</p>
                  <p className="text-xs" style={{ color: '#9CA38F' }}>{opt.desc}</p>
                </button>
              ))}
            </div>

            {method === 'cash' && (
              <div className="space-y-3">
                <div className="rounded-2xl px-4 py-3 border-2 transition"
                  style={{ borderColor: received > 0 ? (change >= 0 ? '#658051' : '#DC2626') : '#E8ECE4', background: '#FAFAF8' }}>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: '#9CA38F' }}>Uang Diterima</p>
                  <p className="text-2xl font-bold tracking-wide" style={{ color: received > 0 ? (change >= 0 ? '#658051' : '#DC2626') : '#C8CCBE' }}>
                    {received > 0 ? fmt(received) : 'Rp —'}
                  </p>
                  {received > 0 && (
                    <p className="text-xs mt-0.5 font-semibold" style={{ color: change >= 0 ? '#658051' : '#DC2626' }}>
                      {change >= 0 ? `✅ Kembalian ${fmt(change)}` : `⚠️ Kurang ${fmt(Math.abs(change))}`}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: '#6B7560' }}>Cepat</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {quickAmounts.map((amt) => (
                      <button key={amt}
                        onClick={() => setReceivedRaw(String(amt))}
                        className="py-2 rounded-xl text-xs font-bold border transition"
                        style={received === amt
                          ? { background: '#658051', color: '#fff', borderColor: '#658051' }
                          : { background: '#FAFAF8', color: '#1C1C1A', borderColor: '#E8ECE4' }}
                        onMouseEnter={(e) => { if (received !== amt) e.currentTarget.style.background = '#EDF1EA'; }}
                        onMouseLeave={(e) => { if (received !== amt) e.currentTarget.style.background = '#FAFAF8'; }}>
                        {amt >= 1000000
                          ? `${(amt / 1000000).toFixed(amt % 1000000 === 0 ? 0 : 1)}jt`
                          : `${amt / 1000}rb`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {NUMPAD_ROWS.flat().map((key) => {
                      const isBackspace = key === '⌫';
                      const isClear     = key === 'C';
                      return (
                        <button key={key}
                          onClick={() => padPress(key)}
                          className="rounded-2xl font-bold flex items-center justify-center transition select-none"
                          style={{
                            height: '3.25rem',
                            background: isBackspace ? '#FEF2F2' : isClear ? '#F7F7F5' : '#FAFAF8',
                            color:      isBackspace ? '#DC2626'  : isClear ? '#6B7560' : '#1C1C1A',
                            border:     `1.5px solid ${isBackspace ? '#FECACA' : '#E8ECE4'}`,
                            fontSize:   isBackspace ? '1.1rem' : '1.2rem',
                          }}
                          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.93)'}
                          onMouseUp={(e)   => e.currentTarget.style.transform = 'scale(1)'}
                          onMouseLeave={(e)=> e.currentTarget.style.transform = 'scale(1)'}>
                          {key}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {NUMPAD_ZEROS.map((key) => (
                      <button key={key}
                        onClick={() => padPress(key)}
                        className="rounded-2xl font-bold flex items-center justify-center transition select-none"
                        style={{
                          height: '3.25rem',
                          background: '#FAFAF8',
                          color: '#1C1C1A',
                          border: '1.5px solid #E8ECE4',
                          fontSize: '1.1rem',
                          letterSpacing: '0.05em',
                        }}
                        onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.93)'}
                        onMouseUp={(e)   => e.currentTarget.style.transform = 'scale(1)'}
                        onMouseLeave={(e)=> e.currentTarget.style.transform = 'scale(1)'}>
                        {key}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {method === 'qris' && (
              <div className="rounded-2xl p-5 text-center border-2 border-dashed" style={{ borderColor: '#E8ECE4', background: '#FAFAF8' }}>
                <p className="text-4xl mb-3">📱</p>
                <p className="text-sm font-bold" style={{ color: '#1C1C1A' }}>Perlihatkan QRIS ke customer</p>
                <p className="text-xs mt-1.5" style={{ color: '#9CA38F' }}>
                  Setelah customer scan & bayar, tekan konfirmasi di bawah
                </p>
              </div>
            )}

            <div className="space-y-2 pt-1">
              <button
                onClick={() => onConfirm(method, received)}
                disabled={!canConfirm || isPending}
                className="w-full py-4 rounded-2xl font-bold text-sm text-white transition disabled:opacity-40"
                style={{ background: '#658051' }}
                onMouseEnter={(e) => { if (canConfirm && !isPending) e.currentTarget.style.background = '#4d6340'; }}
                onMouseLeave={(e) => e.currentTarget.style.background = '#658051'}>
                {isPending
                  ? '⏳ Membuat order...'
                  : method === 'cash'
                    ? canConfirm ? `✅ Konfirmasi · Kembalian ${fmt(change)}` : 'Masukkan jumlah uang diterima'
                    : '✅ Konfirmasi Pembayaran QRIS'}
              </button>
              <button onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-medium border transition"
                style={{ borderColor: '#E8ECE4', color: '#6B7560' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#F7F7F5'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                ← Kembali ke Pesanan
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Catatan Item ──────────────────────────────
function NoteModal({ item, onSave, onClose }) {
  const [notes, setNotes] = useState(item.currentNote || '');
  const quickNotes = ['Less sugar', 'Less ice', 'No ice', 'Extra sweet', 'No sugar', 'Extra shot', 'Hot', 'Ice'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm">
        <h3 className="font-bold text-base mb-0.5" style={{ color: '#1C1C1A' }}>Catatan</h3>
        <p className="text-sm mb-4" style={{ color: '#9CA38F' }}>{item.name}</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {quickNotes.map((note) => (
            <button key={note}
              onClick={() => setNotes((prev) => prev ? `${prev}, ${note}` : note)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border transition"
              style={{ background: '#FAFAF8', color: '#6B7560', borderColor: '#E8ECE4' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF1EA'; e.currentTarget.style.color = '#658051'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#FAFAF8'; e.currentTarget.style.color = '#6B7560'; }}>
              + {note}
            </button>
          ))}
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Contoh: less ice, no sugar..." rows={3}
          className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none border mb-4"
          style={{ border: '1.5px solid #E8ECE4', color: '#1C1C1A' }}
          onFocus={(e) => e.currentTarget.style.borderColor = '#658051'}
          onBlur={(e) => e.currentTarget.style.borderColor = '#E8ECE4'}
          autoFocus />
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm border font-medium"
            style={{ borderColor: '#E8ECE4', color: '#6B7560' }}>Batal</button>
          <button onClick={() => onSave(notes)}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: '#658051' }}>Simpan</button>
        </div>
      </div>
    </div>
  );
}
