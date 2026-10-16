"use client";

import { useEffect, useRef } from "react";
import { toQuoteItems, useCart, type CartLine } from "@/lib/cart-store";

type ServerLine = { key: string; productId: string; slug: string; name: string; image: string | null; accent: string; selections: CartLine["selections"]; summary: string; quantity: number; unitPrice: number };

/** Keeps a signed-in customer's cart on their account (merging the guest cart once after sign-in). */
export function CartSync({ userId }: { userId: string | null }) {
  const hydrated = useCart((s) => s.hydrated);
  const lines = useCart((s) => s.lines);
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The cart is read from localStorage on load; flag it ready after mount.
  useEffect(() => {
    useCart.setState({ hydrated: true });
  }, []);

  useEffect(() => {
    if (!hydrated || !userId || ready.current) return;
    const flag = `ss-merged-${userId}`;
    const merge = sessionStorage.getItem(flag) !== "1";
    fetch("/api/cart/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: toQuoteItems(useCart.getState().lines), merge }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { lines: ServerLine[] } | null) => {
        if (data && merge) {
          useCart.getState().setLines(
            data.lines.map((l) => ({
              key: l.key, productId: l.productId, slug: l.slug, name: l.name, image: l.image, accent: l.accent,
              selections: l.selections, summary: l.summary, quantity: l.quantity, unitPrice: l.unitPrice,
            })),
          );
        }
        sessionStorage.setItem(flag, "1");
        ready.current = true;
      })
      .catch(() => {});
  }, [hydrated, userId]);

  useEffect(() => {
    if (!userId || !ready.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch("/api/cart/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: toQuoteItems(lines), merge: false }),
      }).catch(() => {});
    }, 800);
  }, [lines, userId]);

  return null;
}
