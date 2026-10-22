"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Lock, Minus, Plus, Shuffle } from "lucide-react";
import { formatINR } from "@/lib/money";
import type { PlanQuote } from "@/lib/plans";
import { earliestStart, WEEKDAY_NAMES, weekdaysLabel } from "@/lib/plans-core";
import { addDays } from "@/lib/time";
import { GPayMark } from "./UpiPay";

type Bowl = { id: string; name: string; image: string | null; accent: string; isVeg: boolean; premium: boolean; hasLarge: boolean; soldOut: boolean };
type Address = { house: string; building: string; street: string; area: string; city: string; state: string; pincode: string; landmark: string; instructions: string };
type CalDay = { date: string; label: string; status: "open" | "closed" | "holiday" | "full" };

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

const emptyAddress: Address = { house: "", building: "", street: "", area: "", city: "Chennai", state: "Tamil Nadu", pincode: "", landmark: "", instructions: "" };

function loadRazorpay() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.75rem] border border-line bg-white p-5 sm:p-6" aria-labelledby={`pstep-${n}`}>
      <h2 id={`pstep-${n}`} className="mb-4 flex items-center gap-3 text-xl font-bold">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-basil text-sm font-bold text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function PlanBuilder(props: {
  plan: { code: string; name: string; days: number | null; minDays: number; maxDays: number; discountPercent: number; weekdays: number[] };
  slots: { id: string; label: string; start: string }[];
  bowls: Bowl[];
  hasLarge: boolean;
  surcharges: { premium: number; large: number };
  upi: boolean;
  user: { name: string; email: string; phone: string };
  address: Address | null;
}) {
  const { plan, bowls } = props;
  const router = useRouter();
  const fixed = plan.days != null;
  const available = useMemo(() => bowls.filter((b) => !b.soldOut), [bowls]);
  const mix = (n: number) => Array.from({ length: n }, (_, i) => available[i % Math.max(1, available.length)]?.id ?? "");

  const [slotId, setSlotId] = useState(props.slots[0]?.id ?? "");
  const slotStart = props.slots.find((x) => x.id === slotId)?.start ?? "12:00";
  const earliest = earliestStart(slotStart);
  const latest = addDays(earliest, 30);
  const [startDate, setStartDate] = useState(() => earliestStart(props.slots[0]?.start ?? "12:00"));
  // A later slot today can move the earliest start; never start before it.
  useEffect(() => {
    if (startDate < earliest) setStartDate(earliest);
  }, [earliest, startDate]);
  const [picked, setPicked] = useState<string[]>([]);
  const [calendar, setCalendar] = useState<CalDay[] | null>(null);
  const [seq, setSeq] = useState<string[]>(() => (fixed ? mix(plan.days!) : []));
  const [byDate, setByDate] = useState<Record<string, string>>({});
  const [fillWith, setFillWith] = useState<string | "mix">("mix");
  const [quantity, setQuantity] = useState(1);
  const [large, setLarge] = useState(false);
  const [contact, setContact] = useState(props.user);
  const [addr, setAddr] = useState<Address>(props.address ?? emptyAddress);
  const [two, setTwo] = useState(false);
  const [label1, setLabel1] = useState("Office");
  const [label2, setLabel2] = useState("Home");
  const [addr2, setAddr2] = useState<Address>(emptyAddress);
  const [byWeekday, setByWeekday] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [saveAddress, setSaveAddress] = useState(!props.address);
  const [accepted, setAccepted] = useState(false);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef<{ sig: string; key: string } | null>(null);

  // Pick-your-days: load the calendar for the chosen delivery time.
  useEffect(() => {
    if (fixed || !slotId) return;
    setCalendar(null);
    fetch(`/api/plans/dates?slotId=${encodeURIComponent(slotId)}&plan=${encodeURIComponent(plan.code)}`)
      .then((r) => r.json())
      .then((d) => {
        setCalendar(d.dates ?? []);
        setPicked((prev) => prev.filter((p) => (d.dates as CalDay[]).some((c) => c.date === p && c.status === "open")));
      })
      .catch(() => setCalendar([]));
  }, [fixed, slotId, plan.code]);

  // A bowl for every picked date (new dates follow the current fill choice).
  useEffect(() => {
    if (fixed) return;
    setByDate((prev) => {
      const next: Record<string, string> = {};
      picked.forEach((d, i) => {
        next[d] = prev[d] || (fillWith === "mix" ? available[i % Math.max(1, available.length)]?.id ?? "" : fillWith);
      });
      return next;
    });
  }, [fixed, picked, fillWith, available]);

  const pincodeOk = /^[1-9][0-9]{5}$/.test(addr.pincode.trim());
  const pincode2Ok = /^[1-9][0-9]{5}$/.test(addr2.pincode.trim());
  const usesTwo = two && Object.values(byWeekday).includes(2);
  const request = useMemo(
    () => ({
      planCode: plan.code,
      slotId,
      startDate: fixed ? startDate : null,
      dates: fixed ? null : [...picked].sort(),
      sequence: fixed ? seq : null,
      bowls: fixed ? {} : byDate,
      quantity,
      large,
      pincode: pincodeOk ? addr.pincode.trim() : null,
      pincode2: usesTwo && pincode2Ok ? addr2.pincode.trim() : null,
      addressByWeekday: usesTwo ? byWeekday : {},
    }),
    [plan.code, slotId, fixed, startDate, picked, seq, byDate, quantity, large, pincodeOk, addr.pincode, usesTwo, pincode2Ok, addr2.pincode, byWeekday],
  );

  // Live price from the server.
  useEffect(() => {
    if (!slotId) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/plans/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't price this plan.");
        setQuote(data);
        setQuoteError("");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setQuoteError((e as Error).message);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [request, slotId]);

  function fillAll(id: string | "mix") {
    setFillWith(id);
    if (fixed) setSeq(id === "mix" ? mix(plan.days!) : Array(plan.days!).fill(id));
    else setByDate(Object.fromEntries([...picked].sort().map((d, i) => [d, id === "mix" ? available[i % Math.max(1, available.length)]?.id ?? "" : id])));
  }

  function setDayBowl(i: number, date: string, id: string) {
    if (fixed) setSeq((s) => s.map((v, j) => (j === i ? id : v)));
    else setByDate((b) => ({ ...b, [date]: id }));
  }

  function togglePick(d: string) {
    setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : p.length >= plan.maxDays ? p : [...p, d].sort()));
  }

  const extraOf = (b: Bowl) => (b.premium && props.surcharges.premium ? ` · premium +${formatINR(props.surcharges.premium)}/day` : "");
  const days = quote?.days ?? [];
  const blockers = quote?.blockers ?? [];
  const formOk =
    contact.name.trim().length >= 2 &&
    /^[6-9]\d{9}$/.test(contact.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "")) &&
    /^\S+@\S+\.\S+$/.test(contact.email) &&
    addr.house.trim() &&
    addr.area.trim().length >= 2 &&
    pincodeOk &&
    (!usesTwo || (addr2.house.trim() && addr2.area.trim().length >= 2 && pincode2Ok));
  const canPay = !!quote && blockers.length === 0 && formOk && accepted && !busy;

  async function pay() {
    setError("");
    setBusy(true);
    const payload = {
      ...request,
      pincode: addr.pincode.trim(),
      contact: { name: contact.name.trim(), phone: contact.phone, email: contact.email.trim() },
      address: { ...addr, pincode: addr.pincode.trim() },
      addressLabel: usesTwo ? label1.trim() || "Address 1" : "",
      address2: usesTwo ? { ...addr2, pincode: addr2.pincode.trim() } : null,
      address2Label: usesTwo ? label2.trim() || "Address 2" : "",
      notes: notes.trim(),
      saveAddress,
      acceptedPolicy: true as const,
    };
    const sig = JSON.stringify(payload);
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: crypto.randomUUID() };
    try {
      const res = await fetch("/api/plans/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: keyRef.current.key }) });
      const data = await res.json();
      if (res.status === 401) return router.push(`/login?next=/plans/${plan.code.toLowerCase()}`);
      if (!res.ok) throw new Error(data.error || "We couldn't start your plan.");
      const go = (num: string, token: string, fresh = false) => router.push(`/order/${num}?t=${token}${fresh ? "&new=1" : ""}`);
      if (data.paid) return go(data.orderNumber, data.trackingToken, true);
      if (data.upi || data.simulate) return go(data.orderNumber, data.trackingToken);
      if (!data.razorpay) throw new Error("Online payment isn't available right now.");
      if (!(await loadRazorpay()) || !window.Razorpay) throw new Error("Couldn't load the payment window. Check your connection and try again.");
      const rzp = new window.Razorpay({
        key: data.razorpay.keyId,
        order_id: data.razorpay.orderId,
        amount: data.amount,
        currency: "INR",
        name: "Salad Stories",
        description: `${plan.name} plan ${data.planNumber}`,
        prefill: data.prefill,
        theme: { color: "#1f6b3a" },
        config: { display: { hide: (data.razorpay.hide as string[]).map((method) => ({ method })), preferences: { show_default_blocks: true } } },
        handler: async (resp: Record<string, string>) => {
          const v = await fetch("/api/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resp) });
          const vd = await v.json().catch(() => ({}));
          go(data.orderNumber, data.trackingToken, !!(v.ok && vd.paid));
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError("Payment was cancelled. Your plan is saved — tap Pay again to retry.");
          },
        },
      });
      rzp.on("payment.failed", (r: unknown) => {
        const err = (r as { error?: { description?: string; metadata?: { order_id?: string; payment_id?: string } } }).error;
        fetch("/api/payments/failed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ razorpay_order_id: err?.metadata?.order_id, razorpay_payment_id: err?.metadata?.payment_id, reason: err?.description }),
        }).catch(() => {});
        setError(`Payment failed: ${err?.description ?? "please try again or use another method"}.`);
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, opts: { id: string; type?: string; placeholder?: string; inputMode?: "numeric" | "email" | "tel"; autoComplete?: string; className?: string } ) => (
    <div className={opts.className}>
      <label className="label" htmlFor={opts.id}>{label}</label>
      <input id={opts.id} className="field" type={opts.type ?? "text"} value={value} placeholder={opts.placeholder} inputMode={opts.inputMode} autoComplete={opts.autoComplete} onChange={(e) => onChange(e.target.value)} />
    </div>
  );

  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Step n={1} title={fixed ? "When should we deliver?" : "Pick your days"}>
          <p className="label">Delivery time</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Delivery time">
            {props.slots.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={slotId === s.id} onClick={() => setSlotId(s.id)}
                className={`rounded-full border-2 px-4 py-2 text-sm font-semibold ${slotId === s.id ? "border-basil bg-basil-soft text-basil-deep" : "border-line bg-white"}`}>
                {s.label}
              </button>
            ))}
          </div>

          {fixed ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-[12rem_1fr] sm:items-end">
              <div>
                <label className="label" htmlFor="start">Start date</label>
                <input id="start" type="date" className="field" min={earliest} max={latest} value={startDate}
                  onChange={(e) => setStartDate(e.target.value < earliest ? earliest : e.target.value)} />
              </div>
              {days.length > 0 && (
                <p className="text-sm text-ink-soft">
                  {days.length} delivery days: <b className="text-ink">{shortDate(days[0].date)}</b> to <b className="text-ink">{shortDate(days[days.length - 1].date)}</b>
                  {" "}— deliveries {weekdaysLabel(plan.weekdays)} only.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-5">
              <p className="label">Tap the dates you want <span className="font-normal text-ink-soft">({picked.length} picked · {plan.minDays}–{plan.maxDays} days · {weekdaysLabel(plan.weekdays)})</span></p>
              {!calendar ? (
                <p className="text-sm text-ink-soft">Loading dates…</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {calendar.map((c) => {
                    const on = picked.includes(c.date);
                    const open = c.status === "open";
                    return (
                      <button key={c.date} type="button" disabled={!open} onClick={() => togglePick(c.date)} aria-pressed={on}
                        className={`rounded-xl border-2 px-1 py-2 text-center text-xs font-semibold leading-tight ${on ? "border-basil bg-basil text-white" : open ? "border-line bg-white hover:border-basil" : "border-transparent bg-crate/60 text-ink-soft/60 line-through"}`}
                        title={open ? undefined : c.status === "full" ? "Fully booked" : c.status === "holiday" ? "Closed (holiday)" : "No delivery this day"}>
                        {shortDate(c.date).replace(",", "")}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-6">
            <div>
              <p className="label">Bowls per day</p>
              <div className="flex items-center gap-2">
                <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-line" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Fewer bowls per day"><Minus className="h-4 w-4" /></button>
                <span className="w-6 text-center text-lg font-bold" aria-live="polite">{quantity}</span>
                <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-line" onClick={() => setQuantity((q) => Math.min(3, q + 1))} aria-label="More bowls per day"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
            {props.hasLarge && (
              <label className="flex items-center gap-2.5 font-semibold">
                <input type="checkbox" checked={large} onChange={(e) => setLarge(e.target.checked)} className="h-5 w-5 accent-[#1f6b3a]" />
                Large portions <span className="font-normal text-ink-soft">(+{formatINR(props.surcharges.large)}/day)</span>
              </label>
            )}
          </div>
        </Step>

        <Step n={2} title="Choose a bowl for each day">
          <p className="label">Quick fill</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fillAll("mix")} className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${fillWith === "mix" ? "border-basil bg-basil-soft text-basil-deep" : "border-line"}`}>
              <Shuffle className="h-4 w-4" /> Mix it up
            </button>
            {available.map((b) => (
              <button key={b.id} type="button" onClick={() => fillAll(b.id)} className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${fillWith === b.id ? "border-basil bg-basil-soft text-basil-deep" : "border-line"}`}>
                All {b.name}
              </button>
            ))}
          </div>

          {days.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">{fixed ? "Working out your delivery days…" : "Pick some dates above to choose bowls."}</p>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
              {days.map((d, i) => {
                const chosen = bowls.find((b) => b.id === d.productId);
                const [wd, ...rest] = shortDate(d.date).split(" ");
                return (
                  <li key={d.date} className="grid grid-cols-[3.75rem_1fr] items-center gap-3 px-3 py-2.5">
                    <span className="text-center leading-tight">
                      <span className="block text-xs font-semibold uppercase text-ink-soft">{wd.replace(",", "")}</span>
                      <span className="block text-sm font-bold">{rest.join(" ")}</span>
                    </span>
                    <div>
                      {/* The full bowl name shows (wrapping); the native picker sits invisibly on top for tapping. */}
                      <div className="relative flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 focus-within:ring-3 focus-within:ring-sprout">
                        <span className={`text-sm font-semibold ${chosen ? "" : "text-ink-soft"}`}>{chosen ? chosen.name : "Pick a bowl…"}</span>
                        <span className="flex shrink-0 items-center gap-1 text-sm text-ink-soft">
                          {chosen?.premium && props.surcharges.premium > 0 && <span className="rounded-full bg-mango/30 px-2 text-xs font-semibold text-[#6b4700]">+{formatINR(props.surcharges.premium)}</span>}
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4"><path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                        </span>
                        <select
                          id={`bowl-${d.date}`}
                          aria-label={`Bowl for ${d.label}`}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          value={d.productId ?? ""}
                          onChange={(e) => setDayBowl(i, d.date, e.target.value)}
                        >
                          {!d.productId && <option value="">Pick a bowl…</option>}
                          {bowls.map((b) => (
                            <option key={b.id} value={b.id} disabled={b.soldOut}>
                              {b.name}{extraOf(b)}{b.soldOut ? " (sold out)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      {usesTwo && (
                        <p className="mt-1 text-xs font-semibold text-ink-soft">To {d.addressNo === 2 ? label2 || "Address 2" : label1 || "Address 1"}</p>
                      )}
                      {d.issue && d.productId && <p className="mt-1 text-xs font-semibold text-tomato">{d.issue}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {props.surcharges.premium > 0 && <p className="mt-3 text-xs text-ink-soft">Premium bowls add {formatINR(props.surcharges.premium)} a day to the plan price.</p>}
          <p className="mt-1 text-xs text-ink-soft">Bowls come with their usual choices{large ? " in large portions" : ""}. Add spice level or anything to leave out in the kitchen note below.</p>
        </Step>

        <Step n={3} title="Deliver to">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("Full name", contact.name, (v) => setContact({ ...contact, name: v }), { id: "p-name", autoComplete: "name" })}
            {field("Mobile number", contact.phone, (v) => setContact({ ...contact, phone: v }), { id: "p-phone", inputMode: "tel", autoComplete: "tel" })}
            {field("Email", contact.email, (v) => setContact({ ...contact, email: v }), { id: "p-email", type: "email", inputMode: "email", autoComplete: "email", className: "sm:col-span-2" })}
            {field("House / flat no.", addr.house, (v) => setAddr({ ...addr, house: v }), { id: "p-house" })}
            {field("Building / street", addr.building, (v) => setAddr({ ...addr, building: v }), { id: "p-building" })}
            {field("Area", addr.area, (v) => setAddr({ ...addr, area: v }), { id: "p-area" })}
            {field("PIN code", addr.pincode, (v) => setAddr({ ...addr, pincode: v.replace(/\D/g, "").slice(0, 6) }), { id: "p-pin", inputMode: "numeric" })}
            {field("Landmark (optional)", addr.landmark, (v) => setAddr({ ...addr, landmark: v }), { id: "p-landmark", className: "sm:col-span-2" })}
            {field("Delivery instructions (optional)", addr.instructions, (v) => setAddr({ ...addr, instructions: v }), { id: "p-instr", placeholder: "e.g. Leave with security", className: "sm:col-span-2" })}
            <div className="sm:col-span-2">
              <label className="label" htmlFor="p-notes">Note for the kitchen (optional)</label>
              <textarea id="p-notes" className="field min-h-20" maxLength={300} value={notes} placeholder="e.g. Mild spice, no onion" onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          {quote?.areaError && <p className="mt-3 text-sm font-semibold text-tomato" role="alert">{quote.areaError}</p>}

          <div className="mt-5 rounded-2xl bg-crate p-4">
            <label className="flex items-start gap-2.5 font-semibold">
              <input type="checkbox" checked={two} onChange={(e) => { setTwo(e.target.checked); if (e.target.checked && !Object.keys(byWeekday).length) setByWeekday(Object.fromEntries(plan.weekdays.map((d) => [String(d), d >= 4 ? 2 : 1]))); }} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f6b3a]" />
              <span>Deliver some days to a second address <span className="block text-sm font-normal text-ink-soft">e.g. office on office days, home on work-from-home days</span></span>
            </label>
            {two && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {field("Name for the address above", label1, setLabel1, { id: "p-label1", placeholder: "Office" })}
                  {field("Name for the second address", label2, setLabel2, { id: "p-label2", placeholder: "Home" })}
                </div>
                <div>
                  <p className="label">Which address each day</p>
                  <div className="grid gap-2" role="group" aria-label="Address for each weekday">
                    {plan.weekdays.map((d) => {
                      const n = byWeekday[String(d)] === 2 ? 2 : 1;
                      return (
                        <div key={d} className="flex items-center gap-2">
                          <span className="w-10 text-sm font-bold">{WEEKDAY_NAMES[d]}</span>
                          {[1, 2].map((k) => (
                            <button key={k} type="button" aria-pressed={n === k} onClick={() => setByWeekday((m) => ({ ...m, [String(d)]: k }))}
                              className={`min-h-10 flex-1 rounded-full border-2 px-3 text-sm font-semibold ${n === k ? "border-basil bg-basil text-white" : "border-line bg-white"}`}>
                              {k === 1 ? label1 || "Address 1" : label2 || "Address 2"}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-ink-soft">Addresses are fixed once you pay, so please double-check them.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field(`${label2 || "Second address"}: house / flat no.`, addr2.house, (v) => setAddr2({ ...addr2, house: v }), { id: "p2-house" })}
                  {field("Building / street", addr2.building, (v) => setAddr2({ ...addr2, building: v }), { id: "p2-building" })}
                  {field("Area", addr2.area, (v) => setAddr2({ ...addr2, area: v }), { id: "p2-area" })}
                  {field("PIN code", addr2.pincode, (v) => setAddr2({ ...addr2, pincode: v.replace(/\D/g, "").slice(0, 6) }), { id: "p2-pin", inputMode: "numeric" })}
                  {field("Landmark (optional)", addr2.landmark, (v) => setAddr2({ ...addr2, landmark: v }), { id: "p2-landmark", className: "sm:col-span-2" })}
                  {field("Delivery instructions (optional)", addr2.instructions, (v) => setAddr2({ ...addr2, instructions: v }), { id: "p2-instr", placeholder: "e.g. Call on arrival", className: "sm:col-span-2" })}
                </div>
                {quote?.area2Error && usesTwo && <p className="text-sm font-semibold text-tomato" role="alert">{quote.area2Error}</p>}
              </div>
            )}
          </div>
          {!props.address && (
            <label className="mt-4 flex items-center gap-2.5 text-sm font-semibold">
              <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="h-5 w-5 accent-[#1f6b3a]" />
              Save this address to my account
            </label>
          )}
        </Step>
      </div>

      <aside className="rounded-[1.75rem] border-2 border-basil bg-white p-5 sm:p-6 lg:sticky lg:top-24" aria-labelledby="plan-summary">
        <h2 id="plan-summary" className="text-xl font-bold">Your {plan.name.toLowerCase()} plan</h2>
        {quote ? (
          <>
            <p className="mt-1 text-sm text-ink-soft">
              {days.length} day{days.length === 1 ? "" : "s"} × {quantity} bowl{quantity === 1 ? "" : "s"}{large ? " · large" : ""} · {quote.slot.label}
            </p>
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">{plan.name} plan{quantity > 1 ? ` × ${quantity} bowls a day` : ""}</dt><dd className="font-semibold">{formatINR(quote.breakdown.base)}</dd></div>
              {quote.breakdown.premium > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Premium bowls ({quote.breakdown.premiumDays} day{quote.breakdown.premiumDays === 1 ? "" : "s"})</dt><dd className="font-semibold">+{formatINR(quote.breakdown.premium)}</dd></div>}
              {quote.breakdown.large > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Large portions</dt><dd className="font-semibold">+{formatINR(quote.breakdown.large)}</dd></div>}
              {quote.savings > 0 && <div className="flex justify-between text-basil"><dt>Plan discount ({plan.discountPercent}%)</dt><dd className="font-semibold">−{formatINR(quote.savings)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-soft">Delivery</dt><dd className="font-semibold">{quote.totals.deliveryFee ? formatINR(quote.totals.deliveryFee) : "Free"}</dd></div>
              {quote.totals.tax > 0 && <div className="flex justify-between"><dt className="text-ink-soft">{quote.taxLabel}</dt><dd className="font-semibold">{formatINR(quote.totals.tax)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 text-lg font-bold"><dt>Total</dt><dd>{formatINR(quote.totals.total)}</dd></div>
              {days.length > 0 && <p className="text-right text-xs text-ink-soft">{formatINR(Math.round(quote.totals.total / days.length))} a day</p>}
            </dl>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">{quoteError || "Working out your price…"}</p>
        )}

        {blockers.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-xl bg-tomato/10 p-3 text-sm font-semibold text-tomato" role="alert">
            {blockers.map((b) => <li key={b} className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {b}</li>)}
          </ul>
        )}

        <ul className="mt-4 space-y-1 text-xs text-ink-soft">
          <li>• Swap a day&apos;s bowl or skip a day up to 24 hours before delivery.</li>
          <li>• A skipped day is added to the end of your plan — you never lose a meal.</li>
          <li>• Delivery addresses are fixed once you pay.</li>
        </ul>

        <label className="mt-4 flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f6b3a]" />
          <span>I&apos;ve read the <Link href="/policies/refund" className="font-semibold text-basil underline" target="_blank">cancellation and refund policy</Link> for meal plans.</span>
        </label>
        {!formOk && quote && <p className="mt-2 text-xs text-ink-soft">Fill in your contact and address details to continue.</p>}
        {error && <p className="mt-3 text-sm font-semibold text-tomato" role="alert">{error}</p>}

        <button type="button" onClick={pay} disabled={!canPay} className="btn btn-primary mt-4 h-14 w-full rounded-2xl text-base">
          {busy ? "Starting…" : props.upi ? <><GPayMark /> Pay {quote ? formatINR(quote.totals.total) : ""} with Google Pay</> : <><Lock className="h-4 w-4" /> Pay {quote ? formatINR(quote.totals.total) : ""}</>}
        </button>
        <p className="mt-2 text-center text-xs text-ink-soft">Your plan starts once payment is confirmed.</p>
      </aside>
    </div>
  );
}
