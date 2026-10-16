"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { selectionKey, type Selections } from "./customization";

export interface CartLine {
  key: string; // productId + customization
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  accent: string;
  selections: Selections;
  summary: string;
  quantity: number;
  unitPrice: number; // display hint only — the server always re-prices
}

interface CartState {
  lines: CartLine[];
  couponCode: string | null;
  pincode: string | null;
  areaName: string | null;
  /** True once the page has mounted in the browser (set by <CartSync/>), so
   *  server-rendered HTML and the first client render always match. */
  hydrated: boolean;
  lastAddedAt: number;
  add: (line: Omit<CartLine, "key">) => void;
  replace: (oldKey: string, line: Omit<CartLine, "key">) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setLines: (lines: CartLine[]) => void;
  setCoupon: (code: string | null) => void;
  setLocation: (pincode: string | null, areaName: string | null) => void;
}

const MAX_QTY = 20;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      couponCode: null,
      pincode: null,
      areaName: null,
      hydrated: false,
      lastAddedAt: 0,
      add: (line) =>
        set((s) => {
          const key = selectionKey(line.productId, line.selections);
          const existing = s.lines.find((l) => l.key === key);
          const lines = existing
            ? s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + line.quantity) } : l))
            : [...s.lines, { ...line, key }];
          return { lines, lastAddedAt: Date.now() };
        }),
      replace: (oldKey, line) =>
        set((s) => {
          const key = selectionKey(line.productId, line.selections);
          const others = s.lines.filter((l) => l.key !== oldKey && l.key !== key);
          const merged = s.lines.find((l) => l.key === key && key !== oldKey);
          const qty = Math.min(MAX_QTY, line.quantity + (merged?.quantity ?? 0));
          const idx = s.lines.findIndex((l) => l.key === oldKey);
          const next = [...others];
          next.splice(Math.max(0, Math.min(idx, next.length)), 0, { ...line, key, quantity: qty });
          return { lines: next };
        }),
      setQty: (key, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.key !== key)
              : s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, qty) } : l)),
        })),
      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [], couponCode: null }),
      setLines: (lines) => set({ lines }),
      setCoupon: (couponCode) => set({ couponCode }),
      setLocation: (pincode, areaName) => set({ pincode, areaName }),
    }),
    {
      name: "salad-stories-cart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lines: s.lines, couponCode: s.couponCode, pincode: s.pincode, areaName: s.areaName }),
    },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.quantity, 0);
export const toQuoteItems = (lines: CartLine[]) =>
  lines.map((l) => ({ productId: l.productId, quantity: l.quantity, selections: l.selections }));
