"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { cartCount, useCart } from "@/lib/cart-store";
import { formatINR } from "@/lib/money";

/** Sticky "View cart" bar on phones, plus a short confirmation after adding. */
export function MobileCartBar() {
  const pathname = usePathname();
  const { lines, hydrated, lastAddedAt } = useCart();
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!lastAddedAt || Date.now() - lastAddedAt > 1500) return;
    setToast(true);
    const t = setTimeout(() => setToast(false), 2200);
    return () => clearTimeout(t);
  }, [lastAddedAt]);

  if (!hydrated) return null;
  const hidden = pathname.startsWith("/cart") || pathname.startsWith("/checkout") || pathname.startsWith("/order");
  const count = cartCount(lines);
  const estimate = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  return (
    <>
      {toast && (
        <div role="status" className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
          Added to your cart
        </div>
      )}
      {!hidden && count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
          <Link href="/cart" className="btn btn-primary h-14 w-full justify-between rounded-2xl px-5 text-base shadow-lift">
            <span className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              {count} item{count > 1 ? "s" : ""}
            </span>
            <span>View cart · {formatINR(estimate)}</span>
          </Link>
        </div>
      )}
    </>
  );
}
