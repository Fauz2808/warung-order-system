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
    // Support both menu.id (old) and menu.menuId (new explicit form)
    const resolvedId = menu.menuId ?? menu.id;
    const existing = items.find((i) => i.menuId === resolvedId);
    if (existing) {
      // Kalau sudah ada, tambah quantity
      set({
        items: items.map((i) =>
          i.menuId === resolvedId ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
    } else {
      set({
        items: [
          ...items,
          {
            menuId: resolvedId,
            name: menu.name,
            price: menu.price,
            quantity: 1,
            notes: menu.notes || '',
            hasTemperatureOption: menu.hasTemperatureOption || false,
            temperature: menu.temperature ?? (menu.hasTemperatureOption ? 'ice' : undefined),
            hasAdditionalEspresso: menu.hasAdditionalEspresso || false,
            additionalEspressoShots: menu.additionalEspressoShots || 0,
            additionalEspressoPrice: menu.additionalEspressoPrice || 0,
          },
        ],
      });
    }
  },

  // Update pilihan suhu per item (hot / ice)
  updateTemperature: (menuId, temperature) =>
    set({ items: get().items.map((i) => (i.menuId === menuId ? { ...i, temperature } : i)) }),

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

  // Total harga (termasuk espresso extra)
  getTotal: () => get().items.reduce((sum, i) => {
    const espressoExtra = (i.additionalEspressoShots || 0) * (i.additionalEspressoPrice || 0);
    return sum + (i.price + espressoExtra) * i.quantity;
  }, 0),

  // Total jumlah item
  getTotalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

  // Kosongkan keranjang setelah order berhasil
  clearCart: () => set({ items: [] }),
}));

export default useCartStore;
