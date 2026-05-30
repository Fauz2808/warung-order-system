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
  const [showPayment, setShowPayment] = useState(false); // payment modal
  const [customerName, setCustomerName] = useState('');
  const [payNow, setPayNow] = useState(true); // true = bayar sekarang, false = bayar nanti

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

  // Helper: emoji untuk menu card
  const getCatEmoji = (slug) => categories.find((c) => c.slug === slug)?.emoji ?? '☕';

  const orderMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: (res) => {
      // Invalidate cache orders di kasir page supaya langsung muncul
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
  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.menuId === item.id);
      if (existing) return prev.map((i) => i.menuId === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        menuId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        notes: '',
        hasTemperatureOption: item.hasTemperatureOption || false,
        temperature: item.hasTemperatureOption ? 'ice' : undefined,
        hasAdditionalEspresso: item.hasAdditionalEspresso || false,
        additionalEspressoShots: 0,
        additionalEspressoPrice: item.additionalEspressoPrice || 3000,
      }];
    });
  };

  const updateTemperature = (menuId, temperature) => {
    setCart((prev) => prev.map((item) => item.menuId === menuId ? { ...item, temperature } : item));
  };

  const updateEspresso = (menuId, shots) => {
    setCart((prev) => prev.map((item) => item.menuId === menuId
      ? { ...item, additionalEspressoShots: Math.max(0, Math.min(10, shots)) }
      : item));
  };

  const removeFromCart = (menuId) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.menuId === menuId);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter((i) => i.menuId !== menuId);
      return prev.map((i) => i.menuId === menuId ? { ...i, quantity: i.quantity - 1 } : i);
    });
  };

  const updateItemNotes = (menuId, notes) =>
    setCart((prev) => prev.map((i) => i.menuId === menuId ? { ...i, notes } : i));

  const clearCart = () => setCart([]);
  const getQty = (menuId) => cart.find((i) => i.menuId === menuId)?.quantity || 0;
  const totalAmount = cart.reduce((sum, i) => {
    const espressoExtra = (i.additionalEspressoShots || 0) * (i.additionalEspressoPrice || 0);
    return sum + (i.price + espressoExtra) * i.quantity;
  }, 0);
  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0);

  // ── Filter menu ───────────────────────────────────
  // Hanya tampilkan kategori yang ada menu-nya (urutan dari DB)
  const activeSlugs = new Set(menu.map((m) => m.category));
  const filteredCategories = categories.filter((c) => activeSlugs.has(c.slug));

  const filtered = menu.filter((m) => {
    const catMatch = activeCategory === 'semua' || m.category === activeCategory;
    const searchMatch = !search || m.name.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch; // tampilkan semua, termasuk yg tidak tersedia
  });

  // Stok helpers
  const isOutOfStock  = (item) => item.stock !== null && item.stock <= 0;
  const isLowStock    = (item) => item.stock !== null && item.stock > 0 && item.stock <= 5;
  const hasStockLimit = (item) => item.stock !== null; // punya batas stok (bukan unlimited)

  // ── Validasi sebelum ke payment ───────────────────
  const handleSubmit = () => {
    if (cart.length === 0) { toast.error('Keranjang kosong!'); return; }
    if (!selectedTable && orderType === 'dine-in') { toast.error('Pilih meja dulu!'); return; }

    // Validasi cart — hapus item yg sudah tidak tersedia / stok habis
    const invalidItems = cart.filter((cartItem) => {
      const menuItem = menu.find((m) => m.id === cartItem.menuId);
      return !menuItem || !menuItem.isAvailable || isOutOfStock(menuItem);
    });
    if (invalidItems.length > 0) {
      setCart((prev) => prev.filter((cartItem) => {
        const menuItem = menu.find((m) => m.id === cartItem.menuId);
        return menuItem && menuItem.isAvailable && !isOutOfStock(menuItem);
      }));
      toast.error(`${invalidItems.map((i) => i.name).join(', ')} sudah habis dan dihapus dari keranjang`);
      return;
    }

    // Bayar nanti → langsung submit tanpa payment modal
    if (!payNow) {
      const tableId = orderType === 'take-away' ? (tables[0]?.id || 1) : parseInt(selectedTable);
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
            i.temperature ? (i.temperature === 'hot' ? '🔥 Hot' : '🧊 Ice') : null,
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

    // Bayar sekarang → buka payment modal
    setShowCartDrawer(false);
    setShowPayment(true);
  };

  // ── Final submit setelah payment confirmed ────────
  const handleConfirmPayment = (paymentMethod, receivedAmount) => {
    const tableId = orderType === 'take-away' ? (tables[0]?.id || 1) : parseInt(selectedTable);
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
          i.temperature ? (i.temperature === 'hot' ? '🔥 Hot' : '🧊 Ice') : null,
          i.additionalEspressoShots > 0 ? `+${i.additionalEspressoShots} Espresso Shot` : null,
          i.notes || null,
        ].filter(Boolean).join(' · ') || undefined,
        additionalEspressoShots: i.additionalEspressoShots || 0,
        additionalEspressoPrice: i.additionalEspressoPrice || 0,
      })),
    });
    setShowPayment(false);
  };

  // ── Order panel JSX (dipakai di desktop sidebar & mobile drawer) ─
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
          cart.map((item) => (
            <div key={item.menuId} className="rounded-xl p-3 border" style={{ background: '#FAFAF8', borderColor: '#E8ECE4' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#1C1C1A' }}>{item.name}</p>
                  <p className="text-xs" style={{ color: '#658051' }}>{formatRupiah((item.price + (item.additionalEspressoShots || 0) * (item.additionalEspressoPrice || 0)) * item.quantity)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => removeFromCart(item.menuId)}
                    className="w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center"
                    style={{ background: '#FEE2E2', color: '#DC2626' }}>−</button>
                  <span className="text-sm font-bold w-5 text-center" style={{ color: '#1C1C1A' }}>{item.quantity}</span>
                  <button onClick={() => { const m = menu.find((x) => x.id === item.menuId); if (m) addToCart(m); }}
                    className="w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center text-white"
                    style={{ background: '#658051' }}>+</button>
                </div>
              </div>
              {/* Temperature selector — only for drinks with hasTemperatureOption */}
              {item.hasTemperatureOption && (
                <div className="flex gap-1 mt-1">
                  {[{ v: 'hot', l: '🔥 Hot' }, { v: 'ice', l: '🧊 Ice' }].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => updateTemperature(item.menuId, opt.v)}
                      className="px-2 py-0.5 rounded-lg text-xs font-semibold border transition"
                      style={item.temperature === opt.v
                        ? { background: opt.v === 'hot' ? '#FEF3C7' : '#DBEAFE', color: opt.v === 'hot' ? '#92400E' : '#1E40AF', borderColor: opt.v === 'hot' ? '#FCD34D' : '#93C5FD' }
                        : { background: '#F7F7F5', color: '#9CA38F', borderColor: '#E8ECE4' }}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              )}
              {/* Espresso shot stepper */}
              {item.hasAdditionalEspresso && (
                <div className="mt-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: '#9CA38F' }}>☕ Espresso Shot</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateEspresso(item.menuId, (item.additionalEspressoShots || 0) - 1)}
                        disabled={(item.additionalEspressoShots || 0) === 0}
                        className="w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center border transition disabled:opacity-30"
                        style={{ borderColor: '#E8ECE4', color: '#658051' }}>−</button>
                      <span className="text-xs font-bold w-4 text-center" style={{ color: '#1C1C1A' }}>{item.additionalEspressoShots || 0}</span>
                      <button
                        onClick={() => updateEspresso(item.menuId, (item.additionalEspressoShots || 0) + 1)}
                        className="w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center text-white transition"
                        style={{ background: '#658051' }}>+</button>
                    </div>
                  </div>
                  {(item.additionalEspressoShots || 0) > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: '#658051' }}>
                      +{formatRupiah((item.additionalEspressoShots || 0) * (item.additionalEspressoPrice || 3000))}
                    </p>
                  )}
                </div>
              )}
              {item.notes ? (
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#92400E' }}>
                    ⚠️ {item.notes}
                  </p>
                  <button onClick={() => setNoteModal({ menuId: item.menuId, name: item.name, currentNote: item.notes })}
                    className="text-xs underline ml-2 shrink-0" style={{ color: '#9CA38F' }}>edit</button>
                </div>
              ) : (
                <button onClick={() => setNoteModal({ menuId: item.menuId, name: item.name, currentNote: '' })}
                  className="text-xs mt-1.5" style={{ color: '#9CA38F' }}>
                  + tambah catatan
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Settings — scrollable form fields */}
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
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#6B7560' }}>Nomor Meja</p>
            {loadingTables ? <p className="text-xs" style={{ color: '#9CA38F' }}>Memuat...</p> : (
              <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none border"
                style={{ border: '1px solid #E8ECE4', color: selectedTable ? '#1C1C1A' : '#9CA38F', background: '#FAFAF8' }}>
                <option value="">-- Pilih Meja --</option>
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

      {/* Footer — total + buttons, selalu terlihat di bawah */}
      <div className="px-4 pb-4 pt-3 space-y-2 shrink-0 border-t" style={{ borderColor: '#E8ECE4' }}>
        {cart.length > 0 && (
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold" style={{ color: '#6B7560' }}>Total</span>
            <span className="text-lg font-bold" style={{ color: '#658051' }}>{formatRupiah(totalAmount)}</span>
          </div>
        )}
        <button onClick={handleSubmit}
          disabled={cart.length === 0 || orderMutation.isPending}
          className="w-full py-3 rounded-xl font-bold text-sm text-white transition disabled:opacity-40"
          style={{ background: payNow ? '#658051' : '#6B7560' }}
          onMouseEnter={(e) => { if (cart.length > 0) e.currentTarget.style.background = payNow ? '#4d6340' : '#4b5563'; }}
          onMouseLeave={(e) => e.currentTarget.style.background = payNow ? '#658051' : '#6B7560'}>
          {orderMutation.isPending
            ? 'Membuat order...'
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

          {/* ── LEFT: Menu panel (full width mobile, partial desktop) */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {/* Search + category */}
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
                {/* Tab "Semua" */}
                <button onClick={() => setActiveCategory('semua')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0"
                  style={activeCategory === 'semua'
                    ? { background: '#658051', color: '#fff' }
                    : { background: '#F7F7F5', color: '#6B7560' }}>
                  Semua
                </button>
                {/* Tab per kategori (dari DB, hanya yg ada menu-nya) */}
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

            {/* Menu grid — 2 col mobile, 3 col sm, 4 col xl */}
            <div className="flex-1 overflow-y-auto p-3 pb-32 lg:pb-4">
              {loadingMenu ? (
                <div className="text-center py-12" style={{ color: '#9CA38F' }}><p>Memuat menu...</p></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12" style={{ color: '#9CA38F' }}>
                  <p className="text-3xl mb-2">🔍</p><p>Menu tidak ditemukan</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                  {filtered.map((item) => {
                    const qty         = getQty(item.id);
                    const unavailable = !item.isAvailable;
                    const outStock    = isOutOfStock(item);
                    const lowStock    = isLowStock(item);
                    const hasLimit    = hasStockLimit(item);
                    const remaining   = hasLimit ? item.stock - qty : null;
                    const atMax       = hasLimit && qty >= item.stock;
                    const disabled    = unavailable || outStock;

                    return (
                      <div key={item.id} className="bg-white rounded-2xl border overflow-hidden"
                        style={{
                          borderColor: unavailable ? '#E5E7EB' : outStock ? '#FECACA' : atMax ? '#FCD34D' : qty > 0 ? '#658051' : '#E8ECE4',
                          boxShadow:   qty > 0 && !disabled ? `0 0 0 2px ${atMax ? '#FCD34D44' : '#65805133'}` : 'none',
                          opacity:     disabled ? 0.6 : 1,
                        }}>
                        {/* Foto */}
                        <div className="relative h-20 sm:h-24 flex items-center justify-center" style={{ background: '#F7F7F5' }}>
                          {item.imageUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" style={{ filter: disabled ? 'grayscale(70%)' : 'none' }} />
                            : <span className="text-3xl" style={{ filter: disabled ? 'grayscale(1)' : 'none' }}>{getCatEmoji(item.category)}</span>}

                          {/* Badge qty di cart */}
                          {qty > 0 && !disabled && (
                            <div className="absolute top-1.5 right-1.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                              style={{ background: atMax ? '#D97706' : '#658051' }}>{qty}</div>
                          )}
                          {/* Badge TIDAK TERSEDIA */}
                          {unavailable && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white text-center leading-tight"
                                style={{ background: 'rgba(107,114,128,0.88)' }}>Tidak<br/>Tersedia</span>
                            </div>
                          )}
                          {/* Badge HABIS */}
                          {!unavailable && outStock && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white"
                                style={{ background: 'rgba(220,38,38,0.85)' }}>Habis</span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-2 sm:p-2.5">
                          <p className="font-semibold text-xs leading-tight mb-0.5 line-clamp-1"
                            style={{ color: disabled ? '#9CA38F' : '#1C1C1A' }}>{item.name}</p>

                          {/* Harga + indikator stok */}
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold"
                              style={{ color: disabled ? '#9CA38F' : '#658051' }}>{formatRupiah(item.price)}</p>
                            {!disabled && hasLimit && (
                              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md"
                                style={
                                  atMax    ? { background: '#FEF3C7', color: '#92400E' } :
                                  lowStock ? { background: '#FEE2E2', color: '#DC2626' } :
                                             { background: '#EDF1EA', color: '#658051' }
                                }>
                                {atMax ? 'Maks!' : `Sisa ${remaining}`}
                              </span>
                            )}
                          </div>

                          {unavailable ? (
                            /* Item dinonaktifkan admin — perlu restock/aktifkan */
                            <div className="w-full py-1.5 rounded-lg text-xs font-semibold text-center"
                              style={{ background: '#F3F4F6', color: '#9CA38F' }}>
                              🔴 Perlu Restock
                            </div>
                          ) : outStock ? (
                            <div className="w-full py-1.5 rounded-lg text-xs font-semibold text-center"
                              style={{ background: '#FEF2F2', color: '#DC2626' }}>
                              Stok Habis
                            </div>
                          ) : qty === 0 ? (
                            <button onClick={() => addToCart(item)}
                              className="w-full py-1.5 rounded-lg text-xs font-semibold text-white transition"
                              style={{ background: '#658051' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#4d6340'}
                              onMouseLeave={(e) => e.currentTarget.style.background = '#658051'}>
                              + Tambah
                            </button>
                          ) : (
                            <div className="flex items-center justify-between gap-1">
                              <button onClick={() => removeFromCart(item.id)}
                                className="w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center"
                                style={{ background: '#FEE2E2', color: '#DC2626' }}>−</button>
                              <span className="text-sm font-bold" style={{ color: atMax ? '#D97706' : '#1C1C1A' }}>
                                {qty}{hasLimit ? `/${item.stock}` : ''}
                              </span>
                              <button onClick={() => addToCart(item)} disabled={atMax}
                                className="w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center text-white disabled:opacity-30"
                                style={{ background: atMax ? '#D97706' : '#658051' }}>+</button>
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

          {/* ── RIGHT: Order panel — desktop only (hidden on mobile) */}
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
              {/* Handle */}
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
          onSave={(notes) => { updateItemNotes(noteModal.menuId, notes); setNoteModal(null); }}
          onClose={() => setNoteModal(null)}
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

// ─── Modal Pembayaran ────────────────────────────────
function PaymentModal({ totalAmount, onConfirm, onClose, isPending }) {
  const [method, setMethod]         = useState('cash');
  const [receivedRaw, setReceivedRaw] = useState(''); // digits only, no separator

  const fmt = (n) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  const received = parseInt(receivedRaw, 10) || 0;
  const change   = received - totalAmount;
  const canConfirm = method === 'qris' || (method === 'cash' && received >= totalAmount);

  // ── Numpad handlers ───────────────────────────────
  const padPress = (key) => {
    if (key === '⌫') {
      setReceivedRaw((p) => p.slice(0, -1));
    } else if (key === 'C') {
      setReceivedRaw('');
    } else {
      // key bisa '0', '00', '000', atau '1'-'9'
      setReceivedRaw((p) => {
        const next = p + key;
        // Batasi max 10 digit (maks 9.999.999.999)
        return next.length > 10 ? p : next;
      });
    }
  };

  // Quick amounts — pecahan terdekat ke atas
  const quickAmounts = (() => {
    const denoms = [5000, 10000, 20000, 50000, 100000, 200000, 500000];
    const result = new Set();
    result.add(totalAmount); // pas
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

      {/* Modal — full-width bottom sheet on mobile, centered card on sm+ */}
      <div className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden"
        style={{ maxHeight: '96vh' }}>

        {/* Handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(96vh - 12px)' }}>

          {/* Header */}
          <div className="px-4 pt-3 pb-3 flex items-center justify-between border-b" style={{ borderColor: '#E8ECE4' }}>
            <div>
              <h3 className="font-bold text-base" style={{ color: '#1C1C1A' }}>💳 Pembayaran</h3>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-sm"
              style={{ background: '#F7F7F5', color: '#6B7560' }}>✕</button>
          </div>

          <div className="px-4 pt-3 pb-4 space-y-3">

            {/* Total tagihan */}
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: '#EDF1EA' }}>
              <p className="text-xs font-semibold" style={{ color: '#6B7560' }}>Total Tagihan</p>
              <p className="text-xl font-bold" style={{ color: '#658051' }}>{fmt(totalAmount)}</p>
            </div>

            {/* Pilih metode */}
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

            {/* ── CASH ── */}
            {method === 'cash' && (
              <div className="space-y-3">

                {/* Display uang diterima */}
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

                {/* Quick amounts */}
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
                        onMouseEnter={(e) => { if (received !== amt) { e.currentTarget.style.background = '#EDF1EA'; } }}
                        onMouseLeave={(e) => { if (received !== amt) { e.currentTarget.style.background = '#FAFAF8'; } }}>
                        {/* Format singkat: 50rb, 100rb, dst */}
                        {amt >= 1000000
                          ? `${(amt / 1000000).toFixed(amt % 1000000 === 0 ? 0 : 1)}jt`
                          : `${amt / 1000}rb`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Numpad */}
                <div className="space-y-2">
                  {/* Rows 1–4: angka + C + ⌫ */}
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
                  {/* Row 5: 00 dan 000 — tiap tombol setengah lebar */}
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

            {/* ── QRIS ── */}
            {method === 'qris' && (
              <div className="rounded-2xl p-5 text-center border-2 border-dashed" style={{ borderColor: '#E8ECE4', background: '#FAFAF8' }}>
                <p className="text-4xl mb-3">📱</p>
                <p className="text-sm font-bold" style={{ color: '#1C1C1A' }}>Perlihatkan QRIS ke customer</p>
                <p className="text-xs mt-1.5" style={{ color: '#9CA38F' }}>
                  Setelah customer scan & bayar, tekan konfirmasi di bawah
                </p>
              </div>
            )}

            {/* Confirm + back */}
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
