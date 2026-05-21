// store/cartStore.js
// State keranjang belanja dengan Zustand

import { create } from 'zustand';

const useCartStore = create((set, get) => ({
  items: [],      // [{ menuId, name, price, quantity, notes }]
  tableId: null,
  tableNumber: null,

  // Set meja aktif
  setTable: (tableId, tableNumber) => set({ tableId, tableNumber }),

  // Tambah item ke keranjang
  addItem: (menu) => {
    const items = get().items;
    const existing = items.find((i) => i.menuId === menu.id);
    if (existing) {
      // Kalau sudah ada, tambah quantity
      set({
        items: items.map((i) =>
          i.menuId === menu.id ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
    } else {
      set({
        items: [
          ...items,
          { menuId: menu.id, name: menu.name, price: menu.price, quantity: 1, notes: '' },
        ],
      });
    }
  },

  // Kurangi quantity (kalau 0, hapus dari keranjang)
  removeItem: (menuId) => {
    const items = get().items;
    const existing = items.find((i) => i.menuId === menuId);
    if (!existing) return;

    if (existing.quantity === 1) {
      set({ items: items.filter((i) => i.menuId !== menuId) });
    } else {
      set({
        items: items.map((i) =>
          i.menuId === menuId ? { ...i, quantity: i.quantity - 1 } : i
        ),
      });
    }
  },

  // Update catatan per item
  setNotes: (menuId, notes) =>
    set({ items: get().items.map((i) => (i.menuId === menuId ? { ...i, notes } : i)) }),

  // Total harga
  getTotal: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

  // Total jumlah item
  getTotalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

  // Kosongkan keranjang setelah order berhasil
  clearCart: () => set({ items: [] }),
}));

export default useCartStore;
