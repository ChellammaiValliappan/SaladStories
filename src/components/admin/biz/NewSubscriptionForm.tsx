"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Shuffle } from "lucide-react";
import { createSubscriptionAction } from "@/app/admin/biz-actions";
import { formatINR } from "@/lib/money";
import { WEEKDAY_NAMES } from "@/lib/plans-core";
import type { PlanQuote } from "@/lib/plans";

type Plan = { code: string; name: string; days: number | null; minDays: number; maxDays: number; weekdays: number[]; price: number; pricePerDay: number; isTrial: boolean };
type Bowl = { id: string; name: string; premium: boolean; soldOut: boolean };

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function NewSubscriptionForm(props: {
  customer: { id: string; name: string; pincode: string; preferredSlotId: string | null };
  plans: Plan[];
  slots: { id: string; label: string }[];
  bowls: Bowl[];
  tomorrow: string;
  today: string;
  idempotencyKey: string;
  renew?: { fromId: string; number: string; planCode: string; slotId: string | null; weekdays: number[]; quantity: number; large: boolean; startDate: string } | null;
}) {
  const router = useRouter();
  const available = useMemo(() => props.bowls.filter((b) => !b.soldOut), [props.bowls]);
  const standard = available.filter((b) => !b.premium);
  const [planCode, setPlanCode] = useState((props.renew && props.plans.some((p) => p.code === props.renew!.planCode) ? props.renew.planCode : null) ?? props.plans.find((p) => !p.isTrial && props.renew)?.code ?? props.plans.find((p) => p.isTrial)?.code ?? props.plans[0]?.code ?? "");
  const plan = props.plans.find((p) => p.code === planCode)!;
  const [slotId, setSlotId] = useState(props.renew?.slotId ?? props.customer.preferredSlotId ?? props.slots[0]?.id ?? "");
  const [startDate, setStartDate] = useState(props.renew?.startDate ?? props.tomorrow);
  const [weekdays, setWeekdays] = useState<number[]>(props.renew?.weekdays ?? plan?.weekdays ?? [1, 2, 3, 4, 5]);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const firstPlanEffect = useRef(true);
  const [count, setCount] = useState(plan?.minDays ?? 5);
  const [quantity, setQuantity] = useState(props.renew?.quantity ?? 1);
  const [large, setLarge] = useState(props.renew?.large ?? false);
  const [fill, setFill] = useState<string>("mix");
  const [seq, setSeq] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [payMode, setPayMode] = useState<"now" | "later" | "early">("now");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(props.today);
  const [earlyReason, setEarlyReason] = useState("");
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [qErr, setQErr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const amountTouched = useRef(false);

  // Picking a plan resets its default delivery days.
  useEffect(() => {
    // A renewal keeps the customer's delivery days on first load.
    if (firstPlanEffect.current && props.renew) {
      firstPlanEffect.current = false;
      if (plan) setCount(plan.minDays);
      return;
    }
    firstPlanEffect.current = false;
    if (plan) {
      setWeekdays(plan.weekdays);
      setCount(plan.minDays);
    }
  }, [planCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = plan?.days ?? count;
  const mixFor = (k: number, pool: Bowl[]) => Array.from({ length: k }, (_, i) => pool[i % Math.max(1, pool.length)]?.id ?? "");
  useEffect(() => {
    setSeq((prev) => {
      if (prev.length === n && prev.every(Boolean)) return prev;
      const base = fill === "mix" ? mixFor(n, standard.length ? standard : available) : Array(n).fill(fill);
      return base.map((v, i) => prev[i] || v);
    });
  }, [n, fill]); // eslint-disable-line react-hooks/exhaustive-deps

  // For "pick your days" plans the team gives a start date and a number of days; dates follow the weekdays.
  const request = useMemo(
    () => ({
      planCode,
      slotId,
      startDate,
      dates: null as string[] | null,
      sequence: seq,
      bowls: {},
      quantity,
      large,
      pincode: props.customer.pincode || null,
      addressByWeekday: {},
      weekdays,
    }),
    [planCode, slotId, startDate, seq, quantity, large, props.customer.pincode, weekdays],
  );
  const [customDates, setCustomDates] = useState<string[]>([]);

  useEffect(() => {
    if (!slotId || !planCode || !weekdays.length) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        let body = request;
        if (!plan.days) {
          // Work out `count` dates on the chosen weekdays from the start date.
          const ds: string[] = [];
          for (let d = new Date(`${startDate}T00:00:00Z`); ds.length < count && ds.length < 60; d.setUTCDate(d.getUTCDate() + 1)) {
            if (weekdays.includes(d.getUTCDay())) ds.push(d.toISOString().slice(0, 10));
          }
          setCustomDates(ds);
          body = { ...request, dates: ds };
        }
        const res = await fetch("/api/admin/plans/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't price this plan.");
        setQuote(data);
        setQErr("");
        if (!amountTouched.current) setAmount((data.totals.total / 100).toFixed(2));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setQErr((e as Error).message);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [request, slotId, planCode, weekdays, plan, count, startDate]);

  function fillAll(id: string) {
    setFill(id);
    setSeq(id === "mix" ? mixFor(n, standard.length ? standard : available) : Array(n).fill(id));
  }

  async function save() {
    setBusy(true);
    setError("");
    const res = await createSubscriptionAction({
      idempotencyKey: props.idempotencyKey,
      customerId: props.customer.id,
      planCode,
      slotId,
      startDate,
      dates: plan.days ? null : customDates,
      weekdays,
      sequence: seq,
      quantity,
      large,
      notes,
      payment: payMode === "now" ? { amount: Math.round(Number(amount) * 100), method: method as never, reference: reference || null, paidAt, status: "RECEIVED", note: "" } : null,
      startEarlyReason: payMode === "early" ? earlyReason : null,
      renewedFromId: props.renew?.fromId ?? null,
      allowOverlap,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.push(`/admin/plans/${res.id}?msg=${encodeURIComponent(payMode === "now" ? "Plan created and payment recorded." : "Plan created.")}`);
  }

  const days = quote?.days ?? [];
  const blockers = quote?.blockers ?? [];
  const canSave = !!quote && !blockers.length && !busy && (payMode !== "early" || earlyReason.trim().length >= 3) && (payMode !== "now" || Number(amount) > 0);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-3 text-lg font-bold">Plan</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {props.plans.map((p) => (
              <button key={p.code} type="button" onClick={() => setPlanCode(p.code)} aria-pressed={planCode === p.code}
                className={`rounded-2xl border-2 p-3 text-left ${planCode === p.code ? "border-basil bg-basil-soft" : "border-line"}`}>
                <span className="block font-bold">{p.name}{p.isTrial ? " (trial)" : ""}</span>
                <span className="text-sm text-ink-soft">{p.days ? `${p.days} days · ${formatINR(p.price)}` : `${formatINR(p.pricePerDay)} per day`}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ns-slot">Delivery time</label>
              <select id="ns-slot" className="field" value={slotId} onChange={(e) => setSlotId(e.target.value)}>
                {props.slots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ns-start">Start date</label>
              <input id="ns-start" type="date" className="field" min={props.tomorrow} value={startDate} onChange={(e) => setStartDate(e.target.value || props.tomorrow)} />
            </div>
            {!plan?.days && (
              <div>
                <label className="label" htmlFor="ns-count">Number of days ({plan?.minDays}–{plan?.maxDays})</label>
                <input id="ns-count" type="number" className="field" min={plan?.minDays} max={plan?.maxDays} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} />
              </div>
            )}
          </div>
          <p className="label mt-4">Delivery days for this customer</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = weekdays.includes(d);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== d) : [...w, d].sort()))}
                  className={`min-h-10 rounded-full border-2 px-4 text-sm font-semibold ${on ? "border-basil bg-basil text-white" : "border-line bg-white"}`}>
                  {WEEKDAY_NAMES[d]}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm font-semibold">
              Bowls per day
              <select className="field min-h-10 w-20 py-1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
                {[1, 2, 3].map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={large} onChange={(e) => setLarge(e.target.checked)} className="h-5 w-5 accent-[#1f6b3a]" /> Large portions
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-3 text-lg font-bold">Bowls</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => fillAll("mix")} className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${fill === "mix" ? "border-basil bg-basil-soft" : "border-line"}`}><Shuffle className="h-4 w-4" /> Mix (standard)</button>
            {available.map((b) => (
              <button key={b.id} type="button" onClick={() => fillAll(b.id)} className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${fill === b.id ? "border-basil bg-basil-soft" : "border-line"}`}>
                All {b.name}{b.premium ? " ★" : ""}
              </button>
            ))}
          </div>
          {days.length === 0 ? (
            <p className="text-sm text-ink-soft">{qErr || "Working out the delivery days…"}</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {days.map((d, i) => (
                <li key={d.date} className="grid grid-cols-[6rem_1fr] items-center gap-3 px-3 py-2">
                  <span className="text-sm font-semibold">Day {i + 1}<br /><span className="font-normal text-ink-soft">{shortDate(d.date)}</span></span>
                  <select aria-label={`Bowl for ${d.label}`} className="field min-h-10 py-1.5 text-sm" value={seq[i] ?? ""} onChange={(e) => setSeq((s) => s.map((v, j) => (j === i ? e.target.value : v)))}>
                    {props.bowls.map((b) => <option key={b.id} value={b.id} disabled={b.soldOut}>{b.name}{b.premium ? " ★ premium" : ""}{b.soldOut ? " (sold out)" : ""}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          )}
          <label className="label mt-4" htmlFor="ns-notes">Note for the kitchen (optional)</label>
          <input id="ns-notes" className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Added to the customer's usual instructions" />
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-3 text-lg font-bold">Payment</h2>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
            {[
              { k: "now", t: "Paid now", d: "Record the money received" },
              { k: "later", t: "Not paid yet", d: "Starts when you record payment" },
              { k: "early", t: "Start before payment", d: "Exception — reason required" },
            ].map((o) => (
              <button key={o.k} type="button" role="radio" aria-checked={payMode === o.k} onClick={() => setPayMode(o.k as never)}
                className={`rounded-2xl border-2 p-3 text-left text-sm ${payMode === o.k ? "border-basil bg-basil-soft" : "border-line"}`}>
                <span className="block font-bold">{o.t}</span>
                <span className="text-ink-soft">{o.d}</span>
              </button>
            ))}
          </div>
          {payMode === "now" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ns-amount">Amount received (₹)</label>
                <input id="ns-amount" type="number" step="0.01" min="1" className="field" value={amount} onChange={(e) => { amountTouched.current = true; setAmount(e.target.value); }} />
                <p className="mt-1 text-xs text-ink-soft">Less than the total = partly paid; the plan starts once fully paid.</p>
              </div>
              <div>
                <label className="label" htmlFor="ns-method">Method</label>
                <select id="ns-method" className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="UPI">UPI / Google Pay</option><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ns-ref">Reference (UPI 12-digit ID)</label>
                <input id="ns-ref" className="field" value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <label className="label" htmlFor="ns-paid">Date received</label>
                <input id="ns-paid" type="date" className="field" max={props.today} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
            </div>
          )}
          {payMode === "early" && (
            <div className="mt-4">
              <label className="label" htmlFor="ns-early">Why start before payment?</label>
              <input id="ns-early" className="field" value={earlyReason} onChange={(e) => setEarlyReason(e.target.value)} placeholder="e.g. Regular customer, pays on Friday" />
            </div>
          )}
        </section>
      </div>

      <aside className="rounded-2xl border-2 border-basil bg-white p-5 xl:sticky xl:top-6">
        <h2 className="text-lg font-bold">{props.customer.name}</h2>
        {quote ? (
          <>
            <p className="text-sm text-ink-soft">{plan.name} · {days.length} days · {quote.slot.label}</p>
            {days.length > 0 && <p className="mt-1 text-sm">{shortDate(days[0].date)} → <b>{shortDate(days[days.length - 1].date)}</b></p>}
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">Plan</dt><dd className="font-semibold">{formatINR(quote.breakdown.base)}</dd></div>
              {quote.breakdown.premium > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Premium bowls ({quote.breakdown.premiumDays})</dt><dd className="font-semibold">+{formatINR(quote.breakdown.premium)}</dd></div>}
              {quote.breakdown.large > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Large portions</dt><dd className="font-semibold">+{formatINR(quote.breakdown.large)}</dd></div>}
              {quote.totals.discount > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Discount</dt><dd className="font-semibold">−{formatINR(quote.totals.discount)}</dd></div>}
              {quote.totals.deliveryFee > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Delivery</dt><dd className="font-semibold">{formatINR(quote.totals.deliveryFee)}</dd></div>}
              {quote.totals.tax > 0 && <div className="flex justify-between"><dt className="text-ink-soft">{quote.taxLabel}</dt><dd className="font-semibold">{formatINR(quote.totals.tax)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd>{formatINR(quote.totals.total)}</dd></div>
            </dl>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">{qErr || "Working out the price…"}</p>
        )}
        {blockers.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-xl bg-tomato/10 p-3 text-sm font-semibold text-tomato" role="alert">
            {blockers.map((b) => <li key={b} className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {b}</li>)}
          </ul>
        )}
        {error && <p className="mt-3 text-sm font-semibold text-tomato" role="alert">{error.replace(/^OVERLAP: /, "")}</p>}
        {(error.startsWith("OVERLAP") || allowOverlap) && (
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-basil" checked={allowOverlap} onChange={(e) => setAllowOverlap(e.target.checked)} />
            <span>Two deliveries on the same day is fine (e.g. a second plan for a family member)</span>
          </label>
        )}
        <button type="button" onClick={save} disabled={!canSave} className="btn btn-primary mt-4 h-12 w-full">
          {busy ? "Saving…" : payMode === "now" ? "Create plan & record payment" : "Create plan"}
        </button>
      </aside>
    </div>
  );
}
