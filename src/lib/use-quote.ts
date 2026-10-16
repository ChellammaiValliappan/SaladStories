"use client";

import { useEffect, useRef, useState } from "react";
import type { Quote } from "./pricing";
import { toQuoteItems, useCart } from "./cart-store";

/** Fetches the server's authoritative prices for the current cart. */
export function useQuote(extra: { email?: string; phone?: string; deliveryDate?: string; pincode?: string | null } = {}) {
  const { lines, couponCode, pincode, hydrated, setLines } = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceChanged, setPriceChanged] = useState(false);
  const seq = useRef(0);
  const pin = extra.pincode !== undefined ? extra.pincode : pincode;

  const body = JSON.stringify({
    items: toQuoteItems(lines),
    couponCode,
    pincode: pin,
    email: extra.email || null,
    phone: extra.phone || null,
    deliveryDate: extra.deliveryDate || null,
  });

  useEffect(() => {
    if (!hydrated) return;
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/cart/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        const data = await res.json();
        if (id !== seq.current || !res.ok) return;
        setQuote(data);
        // Keep the cart's display prices in step with the server.
        const current = useCart.getState().lines;
        let changed = false;
        const next = current.map((l) => {
          const s = (data as Quote).lines.find((q) => q.key === l.key);
          if (s && s.unitPrice !== l.unitPrice && s.unitPrice > 0) {
            changed = true;
            return { ...l, unitPrice: s.unitPrice, summary: s.summary || l.summary };
          }
          return l;
        });
        if (changed) {
          setLines(next);
          setPriceChanged(true);
        }
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, hydrated]);

  return { quote, loading: loading || !hydrated, priceChanged };
}
