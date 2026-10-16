"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertCircle, Pencil, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/lib/cart-store";
import { useQuote } from "@/lib/use-quote";
import { formatINR } from "@/lib/money";
import { Stepper } from "./Customizer";
import { CouponBox } from "./CouponBox";
import { Totals } from "./Totals";
import { LocationPicker } from "./LocationPicker";

export function CartView() {
  const { lines, setQty, remove, hydrated, pincode } = useCart();
  const { quote, loading, priceChanged } = useQuote();

  if (!hydrated) return <div className="mt-10 h-40 animate-pulse rounded-3xl bg-crate" />;

  if (lines.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center rounded-[2rem] bg-crate px-6 py-16 text-center">
        <ShoppingBag className="h-12 w-12 text-basil" />
        <h2 className="mt-4 text-3xl font-bold">Your cart is empty</h2>
        <p className="mt-2 max-w-sm text-ink-soft">Pick a bowl from the menu and it'll show up here.</p>
        <Link href="/menu" className="btn btn-primary mt-6">Browse the menu</Link>
      </div>
    );
  }

  const issueFor = (key: string) => quote?.lines.find((l) => l.key === key)?.issue;
  const serverLine = (key: string) => quote?.lines.find((l) => l.key === key);
  const blockers = quote?.blockers.filter((b) => !b.startsWith("Some items")) ?? [];
  const hasIssues = quote?.lines.some((l) => l.issue);
  const canCheckout = quote && !loading && quote.blockers.length === 0;

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_24rem]">
      <div>
        {priceChanged && (
          <p className="mb-4 flex items-start gap-2 rounded-2xl bg-mango/20 p-4 text-sm font-medium">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Some prices have changed since you added these items. Your cart shows the latest prices.
          </p>
        )}
        <ul className="divide-y divide-line rounded-[1.75rem] border border-line bg-white">
          {lines.map((l) => {
            const issue = issueFor(l.key);
            const s = serverLine(l.key);
            const unit = s?.unitPrice ?? l.unitPrice;
            return (
              <li key={l.key} className={`accent-${l.accent} flex gap-4 p-4 sm:p-5`}>
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[var(--accent-soft)] sm:h-24 sm:w-24">
                  {l.image && <Image src={l.image} alt="" fill unoptimized={l.image.endsWith(".svg")} className="object-cover" sizes="96px" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold leading-tight">{l.name}</h3>
                      {l.summary && <p className="mt-1 text-sm text-ink-soft">{l.summary}</p>}
                      <p className="mt-1 text-sm text-ink-soft">{formatINR(unit)} each</p>
                    </div>
                    <p className="shrink-0 font-bold">{formatINR(unit * l.quantity)}</p>
                  </div>
                  {issue && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-tomato/10 p-2.5 text-sm font-semibold text-tomato" role="alert">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {issue}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Stepper value={l.quantity} min={0} max={20} onChange={(v) => setQty(l.key, v)} label={`Quantity of ${l.name}`} />
                    <Link href={`/menu/${l.slug}?edit=${encodeURIComponent(l.key)}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-basil hover:bg-basil-soft">
                      <Pencil className="h-4 w-4" /> Edit
                    </Link>
                    <button type="button" onClick={() => remove(l.key)} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-ink-soft hover:bg-crate">
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <Link href="/menu" className="mt-4 inline-block font-semibold text-basil underline-offset-4 hover:underline">Add another bowl</Link>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="panel p-5">
          <h2 className="mb-2 text-lg font-bold">Delivery location</h2>
          <LocationPicker compact />
          {!pincode && <p className="mt-2 text-sm text-ink-soft">Add your PIN code to see the exact delivery fee.</p>}
        </div>
        <CouponBox quote={quote} />
        <div className="panel p-5">
          <Totals quote={quote} loading={loading} />
          {hasIssues && <p className="mt-3 text-sm font-semibold text-tomato">Fix the highlighted items to continue.</p>}
          {blockers.map((b) => (
            <p key={b} className="mt-3 text-sm font-semibold text-tomato">{b}</p>
          ))}
          <Link
            href={canCheckout ? "/checkout" : "#"}
            aria-disabled={!canCheckout}
            onClick={(e) => !canCheckout && e.preventDefault()}
            className={`btn btn-primary mt-5 h-14 w-full rounded-2xl text-base ${canCheckout ? "" : "pointer-events-none opacity-50"}`}
          >
            Proceed to checkout
          </Link>
        </div>
      </aside>
    </div>
  );
}
