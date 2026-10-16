"use client";

import type { Quote } from "@/lib/pricing";
import { formatINR } from "@/lib/money";

/** Price breakdown: Subtotal − Discount + Tax + Delivery = Total (BRD §6.2). */
export function Totals({ quote, loading }: { quote: Quote | null; loading?: boolean }) {
  if (!quote) return <div className="h-32 animate-pulse rounded-2xl bg-crate" />;
  const t = quote.totals;
  const rows: [string, string, string?][] = [["Subtotal", formatINR(t.subtotal)]];
  if (t.discount > 0) rows.push([`Discount${quote.coupon?.ok ? ` (${quote.coupon.code})` : ""}`, `−${formatINR(t.discount)}`, "text-basil"]);
  rows.push(["Delivery", t.deliveryFee === 0 && t.subtotal > 0 ? "Free" : formatINR(t.deliveryFee)]);
  if (!quote.taxInclusive && t.tax > 0) rows.push([`${quote.taxLabel} (${quote.taxPercent}%)`, formatINR(t.tax)]);

  const toFree = quote.freeDeliveryAbove && t.deliveryFee > 0 ? quote.freeDeliveryAbove - t.subtotal : 0;

  return (
    <div className={loading ? "opacity-60 transition-opacity" : ""} aria-busy={loading}>
      <dl className="space-y-2 text-[0.95rem]">
        {rows.map(([k, v, cls]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-ink-soft">{k}</dt>
            <dd className={`font-semibold tabular-nums ${cls ?? ""}`}>{v}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <dt className="text-lg font-bold">Total to pay</dt>
          <dd className="font-display text-2xl font-[800] tabular-nums">{formatINR(t.total)}</dd>
        </div>
      </dl>
      {quote.taxInclusive && <p className="mt-1 text-xs text-ink-soft">Prices include {quote.taxLabel}.</p>}
      {toFree > 0 && <p className="mt-3 rounded-xl bg-basil-soft p-2.5 text-sm font-medium text-basil-deep">Add {formatINR(toFree)} more for free delivery.</p>}
      {!quote.area && !quote.areaError && t.subtotal > 0 && (
        <p className="mt-2 text-xs text-ink-soft">Delivery fee is confirmed once you enter your PIN code.</p>
      )}
    </div>
  );
}
