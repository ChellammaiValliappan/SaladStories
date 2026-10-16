"use client";

import { useState } from "react";
import { Check, Tag, X } from "lucide-react";
import type { Quote } from "@/lib/pricing";
import { useCart } from "@/lib/cart-store";

export function CouponBox({ quote, bare = false }: { quote: Quote | null; bare?: boolean }) {
  const { couponCode, setCoupon } = useCart();
  const [code, setCode] = useState("");
  const result = quote?.coupon;

  return (
    <div className={bare ? "" : "panel p-5"}>
      {!bare && <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Tag className="h-5 w-5 text-carrot" /> Coupon</h2>}
      {couponCode ? (
        <div>
          <div className={`flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-dashed px-4 py-3 ${result?.ok === false ? "border-tomato" : "border-basil bg-basil-soft"}`}>
            <span className="font-bold tracking-wide">{couponCode}</span>
            <button type="button" onClick={() => setCoupon(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
              <X className="h-4 w-4" /> Remove
            </button>
          </div>
          {result && (
            <p role="status" className={`mt-2 flex items-start gap-1.5 text-sm font-semibold ${result.ok ? "text-basil" : "text-tomato"}`}>
              {result.ok && <Check className="mt-0.5 h-4 w-4 shrink-0" />} {result.message}
            </p>
          )}
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) setCoupon(code.trim().toUpperCase());
            setCode("");
          }}
        >
          <label htmlFor="coupon" className="sr-only">Coupon code</label>
          <input id="coupon" className="field uppercase" placeholder="Enter code" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
          <button className="btn btn-ghost shrink-0" disabled={!code.trim()}>Apply</button>
        </form>
      )}
    </div>
  );
}
