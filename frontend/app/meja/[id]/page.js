'use client';
// app/meja/[id]/page.js
// Halaman utama customer — muncul saat scan QR meja

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getTable, getMenu, createOrder } from '@/lib/api';
import useCartStore from '@/store/cartStore';

// Format harga ke Rupiah
const formatRupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

export default function MejaPage() {
  const { id } = useParams();
  const tableId = parseInt(id);
  const [activeCategory, setActiveCategory] = useState('semua');
  const [showCart, setShowCart] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [addItemModal, setAddItemModal] = useState(null); // item yang sedang dibuka modal-nya

  // Kategori yang butuh pilihan Hot/Ice
  const HOT_ICE_CATEGORIES = ['coffee', 'americano', 'slow-bar', 'signature'];

  const { items, addItem, removeItem, getTotal, getTotalItems, clearCart, setTable } = useCartStore();

  // Ambil data meja
  const { data: table, isLoading: loadingTable, error: tableError } = useQuery({
    queryKey: ['table', tableId],
    queryFn: () => getTable(tableId),
  });

  // Ambil semua menu
  const { data: menu = [], isLoading: loadingMenu } = useQuery({
    queryKey: ['menu'],
    queryFn: getMenu,
  });

  // Set meja ke store saat data table tersedia
  useEffect(() => {
    if (table) setTable(table.id, table.number);
  }, [table, setTable]);

  // Kirim order ke backend
  const orderMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: (res) => {
      setOrderSuccess(res.data);
      clearCart();
      setShowCart(false);
      toast.success('Pesanan berhasil dikirim! 🎉');
    },
    onError: () => {
      toast.error('Gagal mengirim pesanan. Coba lagi.');
    },
  });

  const handleOrder = () => {
    if (items.length === 0) return;
    orderMutation.mutate({
      tableId,
      items: items.map((i) => ({ menuId: i.menuId, quantity: i.quantity, notes: i.notes })),
    });
  };

  const getQuantity = (menuId) => items.find((i) => i.menuId === menuId)?.quantity || 0;

  // Saat klik + — selalu buka AddItemModal (untuk notes + Hot/Ice)
  const handleAddItem = (item) => {
    setAddItemModal(item);
  };

  // Saat modal confirm — tambah ke keranjang dengan suhu + notes
  const handleConfirmAdd = ({ temp, notes }) => {
    if (!addItemModal) return;
    // Gabungkan suhu dan notes jadi satu string
    const combinedNotes = [temp, notes].filter(Boolean).join(' · ');
    addItem({ ...addItemModal, notes: combinedNotes });
    setAddItemModal(null);
    toast.success(`${addItemModal.name} ditambahkan! 🛒`, { duration: 1500 });
  };

  // Filter menu berdasarkan kategori
  const filteredMenu = activeCategory === 'semua' ? menu : menu.filter((m) => m.category === activeCategory);

  const categories = [
    { value: 'semua',      label: 'Semua',        emoji: '☕' },
    { value: 'signature',  label: 'Signature',    emoji: '⭐' },
    { value: 'coffee',     label: 'Coffee',       emoji: '☕' },
    { value: 'americano',  label: 'Americano',    emoji: '🫖' },
    { value: 'slow-bar',   label: 'Slow Bar',     emoji: '🔬' },
    { value: 'non-coffee', label: 'Non Coffee',   emoji: '🧋' },
    { value: 'foods',      label: 'Foods',        emoji: '🍟' },
    { value: 'additional', label: 'Extra Shot',   emoji: '➕' },
  ];

  if (loadingTable) return <LoadingScreen />;
  if (tableError) return <ErrorScreen message="Meja tidak ditemukan. Cek kembali QR code kamu." />;

  // Layar sukses setelah order
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Pesanan Terkirim!</h2>
          <p className="text-gray-500 mb-4">Pesananmu sedang diproses oleh dapur.</p>
          <div className="bg-orange-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-gray-500">Nomor Order</p>
            <p className="text-2xl font-bold text-orange-500">#{orderSuccess.id}</p>
            <p className="text-sm text-gray-500 mt-2">Total</p>
            <p className="font-semibold text-gray-800">{formatRupiah(orderSuccess.totalAmount)}</p>
          </div>
          <p className="text-sm text-gray-400">Silahkan tunggu, kami akan segera menyiapkan pesananmu 🍳</p>
          <button
            onClick={() => setOrderSuccess(null)}
            className="mt-6 w-full bg-orange-500 text-white py-3 rounded-xl font-semibold hover:bg-orange-600 transition"
          >
            Pesan Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header meja */}
      <div className="bg-orange-500 text-white px-4 pt-10 pb-6">
        <p className="text-orange-200 text-sm">Meja Kamu</p>
        <h1 className="text-3xl font-bold">Meja {table?.number} 🍽️</h1>
        <p className="text-orange-200 text-sm mt-1">Lantai {table?.floor}</p>
      </div>

      {/* Filter kategori — horizontal scroll */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition flex-shrink-0 ${
                activeCategory === cat.value
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* List menu */}
      <div className="px-4 pt-4 space-y-3">
        {loadingMenu ? (
          <p className="text-center text-gray-400 py-10">Memuat menu...</p>
        ) : filteredMenu.length === 0 ? (
          <p className="text-center text-gray-400 py-10">Menu tidak tersedia</p>
        ) : (
          filteredMenu.map((item) => (
            <MenuCard
              key={item.id}
              item={item}
              quantity={getQuantity(item.id)}
              onAdd={() => handleAddItem(item)}
              onRemove={() => removeItem(item.id)}
              needsTempChoice={HOT_ICE_CATEGORIES.includes(item.category)}
            />
          ))
        )}
      </div>

      {/* Tombol keranjang (muncul kalau ada item) */}
      {getTotalItems() > 0 && (
        <div className="fixed bottom-6 left-4 right-4 z-20">
          <button
            onClick={() => setShowCart(true)}
            className="w-full bg-orange-500 text-white rounded-2xl py-4 px-6 flex items-center justify-between shadow-lg hover:bg-orange-600 transition"
          >
            <span className="bg-orange-400 rounded-full w-7 h-7 flex items-center justify-center font-bold text-sm">
              {getTotalItems()}
            </span>
            <span className="font-semibold">Lihat Pesanan</span>
            <span className="font-semibold">{formatRupiah(getTotal())}</span>
          </button>
        </div>
      )}

      {/* Modal tambah item (Hot/Ice + Notes) */}
      {addItemModal && (
        <AddItemModal
          item={addItemModal}
          needsTemp={HOT_ICE_CATEGORIES.includes(addItemModal.category)}
          onConfirm={handleConfirmAdd}
          onClose={() => setAddItemModal(null)}
        />
      )}

      {/* Modal keranjang */}
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
        />
      )}
    </div>
  );
}

// ─── Komponen MenuCard ────────────────────────────────
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

  return (
    <div className={`bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm ${!item.isAvailable ? 'opacity-50' : ''}`}>
      {/* Foto / emoji */}
      <div className="w-16 h-16 rounded-xl bg-orange-100 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : categoryEmoji}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-800">{item.name}</p>
          {/* Badge Hot/Ice tersedia */}
          {needsTempChoice && (
            <span className="text-xs bg-blue-50 text-blue-500 border border-blue-100 rounded-full px-2 py-0.5 font-medium">
              🧊 Hot/Ice
            </span>
          )}
          {!item.isAvailable && (
            <span className="text-xs bg-red-50 text-red-400 rounded-full px-2 py-0.5">Habis</span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>
        )}
        <p className="text-orange-500 font-bold mt-1">{formatRupiah(item.price)}</p>
      </div>

      {/* Tombol + / - */}
      {item.isAvailable !== false && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {quantity > 0 ? (
            <>
              <button onClick={onRemove}
                className="w-8 h-8 rounded-full bg-orange-100 text-orange-500 font-bold flex items-center justify-center hover:bg-orange-200 transition">
                −
              </button>
              <span className="w-5 text-center font-semibold text-gray-800">{quantity}</span>
            </>
          ) : null}
          <button onClick={onAdd}
            className="w-8 h-8 rounded-full bg-orange-500 text-white font-bold flex items-center justify-center hover:bg-orange-600 transition">
            +
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Modal Tambah Item (Hot/Ice + Notes) ─────────────
function AddItemModal({ item, needsTemp, onConfirm, onClose }) {
  const [selectedTemp, setSelectedTemp] = useState(needsTemp ? null : 'none');
  const [notes, setNotes] = useState('');

  const categoryEmoji = { 'signature': '⭐', 'coffee': '☕', 'americano': '🫖', 'slow-bar': '🔬', 'non-coffee': '🧋', 'foods': '🍟', 'additional': '➕' }[item.category] ?? '☕';
  const canConfirm = !needsTemp || selectedTemp !== null;

  const quickNotes = ['Less sugar', 'Less ice', 'No ice', 'Extra sweet', 'No sugar', 'Extra shot'];

  return (
    <div className="fixed inset-0 z-40 flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="overflow-y-auto px-6 pb-6 pt-2 flex-1">
          {/* Info item */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center text-2xl flex-shrink-0">
              {item.imageUrl
                ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover rounded-2xl" />
                : categoryEmoji}
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-lg leading-tight">{item.name}</h3>
              <p className="text-orange-500 font-semibold">
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(item.price)}
              </p>
            </div>
          </div>

          {/* Pilihan Hot / Ice — hanya untuk kategori tertentu */}
          {needsTemp && (
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">Pilih Suhu <span className="text-red-400">*</span></p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedTemp('Ice')}
                  className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition active:scale-95 ${
                    selectedTemp === 'Ice'
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-gray-50 hover:border-blue-200'
                  }`}
                >
                  <span className="text-3xl">🧊</span>
                  <span className={`font-bold text-base ${selectedTemp === 'Ice' ? 'text-blue-600' : 'text-gray-600'}`}>Ice</span>
                </button>
                <button
                  onClick={() => setSelectedTemp('Hot')}
                  className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition active:scale-95 ${
                    selectedTemp === 'Hot'
                      ? 'border-red-400 bg-red-50 shadow-sm'
                      : 'border-gray-200 bg-gray-50 hover:border-red-200'
                  }`}
                >
                  <span className="text-3xl">♨️</span>
                  <span className={`font-bold text-base ${selectedTemp === 'Hot' ? 'text-red-500' : 'text-gray-600'}`}>Hot</span>
                </button>
              </div>
            </div>
          )}

          {/* Catatan — opsional */}
          <div className="mb-5">
            <p className="text-sm font-semibold text-gray-700 mb-2">Catatan <span className="text-gray-400 font-normal">(opsional)</span></p>
            {/* Quick notes chips */}
            <div className="flex flex-wrap gap-2 mb-3">
              {quickNotes.map((note) => (
                <button
                  key={note}
                  onClick={() => setNotes((prev) => prev ? `${prev}, ${note}` : note)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-orange-100 hover:text-orange-600 transition border border-gray-200"
                >
                  + {note}
                </button>
              ))}
            </div>
            {/* Input bebas */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: less ice, no sugar, extra pedas..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
            />
          </div>
        </div>

        {/* Footer tombol */}
        <div className="px-6 pb-8 pt-3 border-t bg-white">
          <button
            onClick={() => onConfirm({ temp: selectedTemp === 'none' ? '' : selectedTemp, notes })}
            disabled={!canConfirm}
            className="w-full bg-orange-500 text-white py-4 rounded-2xl font-bold text-base hover:bg-orange-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {needsTemp && !selectedTemp ? 'Pilih suhu dulu' : 'Tambah ke Keranjang 🛒'}
          </button>
          <button onClick={onClose} className="w-full py-2 mt-1 text-gray-400 text-sm">Batal</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Keranjang ──────────────────────────────────
function CartModal({ items, total, onClose, onOrder, onAdd, onRemove, loading, menu }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full bg-white rounded-t-3xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Pesanan Kamu</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {items.map((item) => {
            const menuData = menu.find((m) => m.id === item.menuId);
            return (
              <div key={item.menuId} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800">{item.name}</p>
                    {item.notes === 'Ice' && (
                      <span className="text-xs bg-blue-50 text-blue-500 border border-blue-100 rounded-full px-2 py-0.5">🧊 Ice</span>
                    )}
                    {item.notes === 'Hot' && (
                      <span className="text-xs bg-red-50 text-red-400 border border-red-100 rounded-full px-2 py-0.5">♨️ Hot</span>
                    )}
                  </div>
                  <p className="text-sm text-orange-500">{formatRupiah(item.price)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onRemove(item.menuId)}
                    className="w-7 h-7 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center font-bold"
                  >
                    −
                  </button>
                  <span className="w-5 text-center font-semibold">{item.quantity}</span>
                  <button
                    onClick={() => menuData && onAdd(menuData)}
                    className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold"
                  >
                    +
                  </button>
                </div>
                <p className="w-20 text-right font-semibold text-gray-700 text-sm">
                  {formatRupiah(item.price * item.quantity)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t">
          <div className="flex justify-between mb-4">
            <span className="text-gray-600">Total</span>
            <span className="text-xl font-bold text-orange-500">{formatRupiah(total)}</span>
          </div>
          <button
            onClick={onOrder}
            disabled={loading}
            className="w-full bg-orange-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-orange-600 transition disabled:opacity-50"
          >
            {loading ? 'Mengirim...' : 'Pesan Sekarang 🚀'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading & Error ──────────────────────────────────
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-orange-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4 animate-bounce">🍜</div>
        <p className="text-gray-500">Memuat menu...</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-5xl mb-4">😕</div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
