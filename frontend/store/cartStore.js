// store/cartStore.js
// State keranjang belanja dengan Zustand

import { create } from 'zustand';

// Buat unique key per kombinasi menu + modifiers
const makeCartKey = (menuId, modifiers = []) => {
  const optionIds = [...modifiers].map((m) => m.optionId).sort().join('-');
  return optionIds ? `${menuId}_${optionIds}` : `${menuId}`;
};

const useCartStore = create((set, get) => ({
  items: [],      // [{ cartKey, menuId, name, price, quantity, notes, modifiers, ... }]
  tableId: null,
  tableNumber: null,

  setTable: (tableId, tableNumber) => set({ tableId, tableNumber }),

  // Tambah item ke keranjang (modifiers = [{ optionId, groupName, optionName, priceAdd }])
  addItem: (menu) => {
    const items = get().items;
    const resolvedId = menu.menuId ?? menu.id;
    const modifiers = menu.modifiers || [];
    const cartKey = makeCartKey(resolvedId, modifiers);

    const existing = items.find((i) => i.cartKey === cartKey);
    if (existing) {
      set({ items: items.map((i) => i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i) });
    } else {
      set({
        items: [
          ...items,
          {
            cartKey,
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
            modifiers,
          },
        ],
      });
    }
  },

  updateTemperature: (cartKey, temperature) =>
    set({ items: get().items.map((i) => (i.cartKey === cartKey ? { ...i, temperature } : i)) }),

  // Kurangi quantity (kurangi per cartKey)
  removeItem: (cartKey) => {
    const items = get().items;
    const existing = items.find((i) => i.cartKey === cartKey);
    if (!existing) return;
    if (existing.quantity === 1) {
      set({ items: items.filter((i) => i.cartKey !== cartKey) });
    } else {
      set({ items: items.map((i) => i.cartKey === cartKey ? { ...i, quantity: i.quantity - 1 } : i) });
    }
  },

  setNotes: (cartKey, notes) =>
    set({ items: get().items.map((i) => (i.cartKey === cartKey ? { ...i, notes } : i)) }),

  // Total harga (base + espresso + modifiers) × quantity
  getTotal: () => get().items.reduce((sum, i) => {
    const espressoExtra = (i.additionalEspressoShots || 0) * (i.additionalEspressoPrice || 0);
    const modifierExtra = (i.modifiers || []).reduce((s, m) => s + (m.priceAdd || 0), 0);
    return sum + (i.price + espressoExtra + modifierExtra) * i.quantity;
  }, 0),

  getTotalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

  clearCart: () => set({ items: [] }),
}));

export default useCartStore;
