"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CreditCard, Lock } from "lucide-react";
import { toQuoteItems, useCart } from "@/lib/cart-store";
import { useQuote } from "@/lib/use-quote";
import { formatINR } from "@/lib/money";
import type { SlotOption } from "@/lib/delivery";
import { Totals } from "./Totals";
import { GPayMark } from "./UpiPay";
import { CouponBox } from "./CouponBox";
import { InterestForm } from "./LocationPicker";

type Address = {
  house: string; building: string; street: string; area: string; city: string; state: string; pincode: string; landmark: string; instructions: string;
};
type Saved = Address & { id: string; label: string; fullName: string; phone: string };

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
    <section className="rounded-[1.75rem] border border-line bg-white p-5 sm:p-6" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="mb-4 flex items-center gap-3 text-xl font-bold">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-basil text-sm font-bold text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function CheckoutFlow({
  user,
  savedAddresses,
  paymentsReady,
  simulator,
  methodsText,
  upi = false,
}: {
  user: { name: string; email: string; phone: string } | null;
  savedAddresses: Saved[];
  paymentsReady: boolean;
  simulator: boolean;
  methodsText: string;
  upi?: boolean;
}) {
  const router = useRouter();
  const { lines, couponCode, hydrated, clear, setLocation, pincode: savedPin } = useCart();
  const first = savedAddresses[0];
  const [contact, setContact] = useState({
    name: user?.name ?? first?.fullName ?? "",
    phone: user?.phone ?? first?.phone ?? "",
    email: user?.email ?? "",
  });
  const [address, setAddress] = useState<Address>(first ? { ...first } : emptyAddress);
  const [savedId, setSavedId] = useState<string | null>(first?.id ?? null);
  const [saveAddress, setSaveAddress] = useState(!!user && savedAddresses.length === 0);
  const [slots, setSlots] = useState<{ date: string; label: string; slots: SlotOption[] }[] | null>(null);
  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sim, setSim] = useState<{ orderId: string; trackingToken: string; amount: number } | null>(null);
  const keyRef = useRef<{ payload: string; key: string } | null>(null);

  // Prefill PIN from the header location picker.
  useEffect(() => {
    if (hydrated && !address.pincode && savedPin) setAddress((a) => ({ ...a, pincode: savedPin }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    fetch("/api/delivery/slots")
      .then((r) => r.json())
      .then((d) => {
        setSlots(d.days);
        const firstDay = d.days[0];
        if (firstDay) {
          setDate(firstDay.date);
          const open = firstDay.slots.find((s: SlotOption) => s.available);
          if (open) setSlotId(open.slotId);
        }
      })
      .catch(() => setSlots([]));
  }, []);

  const pinValid = /^[1-9]\d{5}$/.test(address.pincode);
  const { quote, loading } = useQuote({
    email: contact.email,
    phone: contact.phone,
    deliveryDate: date,
    pincode: pinValid ? address.pincode : null,
  });

  // Remember a serviceable PIN for next time.
  useEffect(() => {
    if (quote?.area && pinValid) setLocation(address.pincode, quote.area.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.area?.id]);

  const day = slots?.find((d) => d.date === date);
  const slot = day?.slots.find((s) => s.slotId === slotId);

  const problems = useMemo(() => {
    const p: string[] = [];
    if (contact.name.trim().length < 2) p.push("Enter your full name");
    if (!/^[6-9]\d{9}$/.test(contact.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""))) p.push("Enter a valid 10-digit mobile number");
    if (!/^\S+@\S+\.\S+$/.test(contact.email)) p.push("Enter a valid email address");
    if (!address.house.trim()) p.push("Enter your house or flat number");
    if (address.area.trim().length < 2) p.push("Enter your area");
    if (!pinValid) p.push("Enter a valid 6-digit PIN code");
    if (!slot?.available) p.push("Choose a delivery slot");
    if (!accepted) p.push("Confirm you've read the cancellation and refund policy");
    return p;
  }, [contact, address, pinValid, slot, accepted]);

  if (!hydrated) return <div className="mt-10 h-60 animate-pulse rounded-3xl bg-crate" />;
  if (lines.length === 0)
    return (
      <div className="mt-8 rounded-[2rem] bg-crate p-10 text-center">
        <p className="text-xl font-bold">Your cart is empty.</p>
        <Link href="/menu" className="btn btn-primary mt-5">Browse the menu</Link>
      </div>
    );

  const serverBlockers = quote?.blockers ?? [];
  const couponBad = quote?.coupon && !quote.coupon.ok;
  const canPay = paymentsReady && !busy && !loading && quote && problems.length === 0 && serverBlockers.length === 0 && !couponBad;

  function finish(orderNumber: string, token: string, payNow = false) {
    clear();
    router.push(`/order/${orderNumber}?t=${token}${payNow ? "" : "&new=1"}`);
  }

  async function placeOrder() {
    if (!canPay) return;
    setBusy(true);
    setError("");
    const payload = {
      contact,
      address,
      deliveryDate: date,
      slotId,
      couponCode,
      items: toQuoteItems(lines),
      saveAddress: !!user && saveAddress && !savedId,
      acceptedPolicy: true as const,
    };
    // Same details → same idempotency key, so retries never create duplicate orders.
    const sig = JSON.stringify(payload);
    if (!keyRef.current || keyRef.current.payload !== sig) keyRef.current = { payload: sig, key: crypto.randomUUID() };

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, idempotencyKey: keyRef.current.key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "We couldn't place your order.");
      if (data.paid) return finish(data.orderNumber, data.trackingToken);
      // Google Pay / UPI: the order page shows the GPay button, QR code and transaction-ID box.
      if (data.upi) return finish(data.orderNumber, data.trackingToken, true);
      if (data.simulate) {
        setSim({ orderId: data.orderId, trackingToken: data.trackingToken, amount: data.amount });
        return;
      }
      if (!data.razorpay) throw new Error("Online payment isn't available right now.");
      if (!(await loadRazorpay()) || !window.Razorpay) throw new Error("Couldn't load the payment window. Check your connection and try again.");

      const rzp = new window.Razorpay({
        key: data.razorpay.keyId,
        order_id: data.razorpay.orderId,
        amount: data.amount,
        currency: "INR",
        name: "Salad Stories",
        description: `Order ${data.orderNumber}`,
        prefill: data.prefill,
        theme: { color: "#1f6b3a" },
        config: { display: { hide: (data.razorpay.hide as string[]).map((method) => ({ method })), preferences: { show_default_blocks: true } } },
        handler: async (resp: Record<string, string>) => {
          const v = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(resp),
          });
          const vd = await v.json();
          if (v.ok && vd.paid) finish(vd.orderNumber, vd.trackingToken);
          else {
            // Webhook may still confirm it — send them to the tracking page either way.
            router.push(`/order/${data.orderNumber}?t=${data.trackingToken}`);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError("Payment was cancelled. Your order is saved — tap Pay again to retry.");
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

  async function simulate(outcome: "success" | "failure") {
    if (!sim) return;
    const res = await fetch("/api/payments/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sim, outcome }),
    });
    const d = await res.json();
    setSim(null);
    if (d.paid) finish(d.orderNumber, d.trackingToken);
    else {
      setBusy(false);
      setError("Payment failed (simulated). Tap Pay again to retry.");
    }
  }

  const setA = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSavedId(null);
    setAddress((a) => ({ ...a, [k]: k === "pincode" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value }));
  };

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-5">
        <Step n={1} title="Contact information">
          {!user && (
            <p className="mb-4 text-sm text-ink-soft">
              No account needed. <Link href="/login?next=/checkout" className="font-semibold text-basil underline">Sign in</Link> to use saved addresses.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">Full name</label>
              <input id="name" className="field" autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="phone">Mobile number</label>
              <input id="phone" className="field" inputMode="tel" autoComplete="tel-national" maxLength={13} placeholder="10-digit mobile" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="field" type="email" autoComplete="email" placeholder="For your order confirmation" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </div>
          </div>
        </Step>

        <Step n={2} title="Delivery address">
          {savedAddresses.length > 0 && (
            <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
              {savedAddresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setSavedId(a.id);
                    setAddress({ ...a });
                    setContact((c) => ({ ...c, name: c.name || a.fullName, phone: c.phone || a.phone }));
                  }}
                  className={`shrink-0 rounded-2xl border-[1.5px] px-4 py-2.5 text-left text-sm ${savedId === a.id ? "border-basil bg-basil-soft" : "border-line"}`}
                >
                  <span className="block font-bold">{a.label}</span>
                  <span className="text-ink-soft">{a.house}, {a.area}</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="house">House / flat number</label>
              <input id="house" className="field" autoComplete="address-line1" value={address.house} onChange={setA("house")} />
            </div>
            <div>
              <label className="label" htmlFor="building">Building / apartment <span className="font-normal text-ink-soft">(optional)</span></label>
              <input id="building" className="field" value={address.building} onChange={setA("building")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="street">Street <span className="font-normal text-ink-soft">(optional)</span></label>
              <input id="street" className="field" autoComplete="address-line2" value={address.street} onChange={setA("street")} />
            </div>
            <div>
              <label className="label" htmlFor="area">Area</label>
              <input id="area" className="field" placeholder="e.g. Taramani" value={address.area} onChange={setA("area")} />
            </div>
            <div>
              <label className="label" htmlFor="pincode">PIN code</label>
              <input
                id="pincode"
                className="field"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                value={address.pincode}
                onChange={setA("pincode")}
                aria-invalid={pinValid && !!quote?.areaError}
                aria-describedby="pin-status"
              />
              <p id="pin-status" className="mt-1 min-h-5 text-sm font-semibold">
                {pinValid && quote?.area && <span className="text-basil">Delivering to {quote.area.name}</span>}
              </p>
            </div>
            <div>
              <label className="label" htmlFor="city">City</label>
              <input id="city" className="field" autoComplete="address-level2" value={address.city} onChange={setA("city")} />
            </div>
            <div>
              <label className="label" htmlFor="state">State</label>
              <input id="state" className="field" autoComplete="address-level1" value={address.state} onChange={setA("state")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="landmark">Landmark <span className="font-normal text-ink-soft">(optional)</span></label>
              <input id="landmark" className="field" value={address.landmark} onChange={setA("landmark")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="instructions">Delivery instructions <span className="font-normal text-ink-soft">(optional)</span></label>
              <textarea id="instructions" rows={2} className="field" placeholder="e.g. Call when you reach the gate" value={address.instructions} onChange={setA("instructions")} />
            </div>
          </div>
          {pinValid && quote?.areaError && <InterestForm pincode={address.pincode} message={quote.areaError} />}
          {user && !savedId && (
            <label className="mt-4 flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="h-5 w-5 accent-[#1f6b3a]" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
              Save this address to my account
            </label>
          )}
        </Step>

        <Step n={3} title="Delivery date and time">
          {slots === null ? (
            <div className="h-24 animate-pulse rounded-2xl bg-crate" />
          ) : slots.length === 0 ? (
            <p className="rounded-2xl bg-crate p-4 font-medium">No delivery slots are open right now. Please check back later or message us on WhatsApp.</p>
          ) : (
            <>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Delivery date">
                {slots.map((d) => (
                  <button
                    key={d.date}
                    role="tab"
                    type="button"
                    aria-selected={date === d.date}
                    onClick={() => {
                      setDate(d.date);
                      setSlotId(d.slots.find((s) => s.available)?.slotId ?? "");
                    }}
                    className={`shrink-0 rounded-full border-[1.5px] px-4 py-2 text-sm font-bold ${date === d.date ? "border-basil bg-basil text-white" : "border-line"}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Delivery slot">
                {day?.slots.map((s) => (
                  <button
                    key={s.slotId}
                    type="button"
                    role="radio"
                    aria-checked={slotId === s.slotId}
                    disabled={!s.available}
                    onClick={() => setSlotId(s.slotId)}
                    className={`rounded-2xl border-[1.5px] px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-45 ${
                      slotId === s.slotId ? "border-basil bg-basil-soft" : "border-line"
                    }`}
                  >
                    <span className="block font-bold">{s.name}</span>
                    <span className="block text-sm text-ink-soft">{s.timeLabel}</span>
                    {!s.available && <span className="mt-1 block text-xs font-semibold text-tomato">{s.reason}</span>}
                    {s.available && s.remaining <= 3 && <span className="mt-1 block text-xs font-semibold text-carrot">Only {s.remaining} left</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </Step>

        <Step n={4} title="Order summary">
          <ul className="divide-y divide-line">
            {(quote?.lines ?? []).map((l) => (
              <li key={l.key} className="flex justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{l.quantity} × {l.name}</p>
                  {l.summary && <p className="text-sm text-ink-soft">{l.summary}</p>}
                  {l.issue && <p className="mt-1 text-sm font-semibold text-tomato">{l.issue}</p>}
                </div>
                <p className="shrink-0 font-semibold">{formatINR(l.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <Link href="/cart" className="mt-2 inline-block text-sm font-semibold text-basil underline">Edit cart</Link>
        </Step>

        <Step n={5} title="Coupon code">
          <CouponBox quote={quote} bare />
        </Step>

        <Step n={6} title="Payment method">
          {upi ? (
            <div className="flex items-start gap-3 rounded-2xl bg-crate p-4">
              <GPayMark />
              <div className="text-sm">
                <p className="font-semibold">Google Pay (UPI)</p>
                <p className="text-ink-soft">
                  After you place the order you'll get a Pay with Google Pay button (or a QR code on a computer). No extra charges.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl bg-crate p-4">
              <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-basil" />
              <div className="text-sm">
                <p className="font-semibold">Pay online with Razorpay</p>
                <p className="text-ink-soft">Choose {methodsText} in the next step.</p>
              </div>
            </div>
          )}
          {simulator && (
            <p className="mt-3 rounded-xl bg-mango/25 p-3 text-sm font-medium">
              Test mode: Razorpay keys aren't set, so you'll see a payment simulator instead. This never appears on the live site.
            </p>
          )}
        </Step>

        <Step n={7} title="Review and confirm">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Deliver to</dt>
              <dd className="text-ink-soft">
                {contact.name || "—"}, {contact.phone || "—"}
                <br />
                {[address.house, address.building, address.street, address.area, address.city, address.pincode].filter(Boolean).join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Delivery slot</dt>
              <dd className="text-ink-soft">{slot ? `${day?.label}, ${slot.name} (${slot.timeLabel})` : "—"}</dd>
            </div>
          </dl>
          <label className="mt-5 flex items-start gap-3 rounded-2xl border border-line p-4 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f6b3a]" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>
              I confirm my order and have read the{" "}
              <Link href="/policies/refund" target="_blank" className="font-semibold text-basil underline">cancellation and refund policy</Link>.
            </span>
          </label>
        </Step>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="panel p-5">
          <h2 className="mb-4 text-lg font-bold">Payment summary</h2>
          <Totals quote={quote} loading={loading} />
          {error && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-tomato/10 p-3 text-sm font-semibold text-tomato" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          {!paymentsReady && <p className="mt-4 text-sm font-semibold text-tomato">Online payment isn't set up yet. Please contact us to order.</p>}
          {serverBlockers.filter((b) => !b.startsWith("Some items") && b !== quote?.areaError).map((b) => (
            <p key={b} className="mt-3 text-sm font-semibold text-tomato">{b}</p>
          ))}
          {problems.length > 0 && (
            <p className="mt-4 text-sm text-ink-soft">To continue: {problems[0].toLowerCase()}.</p>
          )}
          <button type="button" onClick={placeOrder} disabled={!canPay} className="btn btn-primary mt-5 h-14 w-full rounded-2xl text-base">
            <Lock className="h-4 w-4" />
            {busy ? "Processing…" : quote ? `Place order · ${formatINR(quote.totals.total)}` : "Place order"}
          </button>
          <p className="mt-3 text-center text-xs text-ink-soft">{upi ? "Next, pay with Google Pay." : "Payments are processed securely by Razorpay."}</p>
        </div>
      </aside>

      {/* Phones: keep the total and pay button in reach */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <button type="button" onClick={placeOrder} disabled={!canPay} className="btn btn-primary h-14 w-full justify-between rounded-2xl px-5 text-base">
          <span className="flex items-center gap-2"><Lock className="h-4 w-4" />{busy ? "Processing…" : "Place order"}</span>
          <span>{quote ? formatINR(quote.totals.total) : ""}</span>
        </button>
        {problems.length > 0 && <p className="mt-1.5 text-center text-xs text-ink-soft">To continue: {problems[0].toLowerCase()}.</p>}
      </div>

      {sim && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="sim-title" className="w-full max-w-sm rounded-3xl bg-paper p-6 text-center">
            <h2 id="sim-title" className="text-2xl font-bold">Payment simulator</h2>
            <p className="mt-2 text-ink-soft">Test mode only. Choose what happens to this {formatINR(sim.amount)} payment.</p>
            <div className="mt-5 grid gap-2">
              <button className="btn btn-primary" onClick={() => simulate("success")}>Simulate successful payment</button>
              <button className="btn btn-ghost" onClick={() => simulate("failure")}>Simulate failed payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
