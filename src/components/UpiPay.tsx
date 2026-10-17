"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Copy, Download, QrCode, Smartphone } from "lucide-react";
import { formatINR } from "@/lib/money";

/** Neutral payment icon (we don't reproduce Google's logo). */
export function GPayMark() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-basil ring-1 ring-line">
      <Smartphone className="h-5 w-5" />
    </span>
  );
}

type Props = {
  orderId: string;
  trackingToken: string;
  orderNumber: string;
  amount: number; // paise
  upiId: string;
  payeeName: string;
  gpayAndroid: string;
  gpayIos: string;
  qrDataUrl: string;
  retry?: boolean;
  /**
   * Business/merchant UPI IDs accept a tap-to-pay link from the website.
   * Personal UPI IDs don't (banks refuse it as "exceeded the bank limit"), so on
   * phones the customer saves the QR and scans it from their gallery instead.
   */
  merchant?: boolean;
};

export function UpiPay(p: Props) {
  const router = useRouter();
  const [platform, setPlatform] = useState<"android" | "ios" | "desktop" | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const ua = navigator.userAgent;
    setPlatform(/android/i.test(ua) ? "android" : /iphone|ipad|ipod/i.test(ua) ? "ios" : "desktop");
  }, []);

  const mobile = platform === "android" || platform === "ios";
  const rupees = formatINR(p.amount);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard blocked — the text is visible anyway */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/payments/upi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: p.orderId, trackingToken: p.trackingToken, utr }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || "Something went wrong. Please try again.");
    router.refresh();
  }

  return (
    <div className="rounded-[2rem] border-2 border-basil bg-white p-5 sm:p-7">
      <p className="text-sm font-semibold text-basil">Order {p.orderNumber} is saved</p>
      <h1 className="mt-1 text-3xl font-[800] sm:text-4xl">
        {p.retry ? "Let's try that payment again" : `Pay ${rupees} to confirm your order`}
      </h1>
      {p.retry && (
        <p className="mt-2 text-ink-soft">We couldn't find your earlier payment. If money already left your account, message us on WhatsApp with a screenshot instead of paying again.</p>
      )}

      <ol className="mt-6 space-y-6">
        <li>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-basil text-sm text-white">1</span>
            Pay with Google Pay
          </h2>

          {mobile && p.merchant && (
            <a
              href={platform === "ios" ? p.gpayIos : p.gpayAndroid}
              className="btn btn-primary mt-3 h-14 w-full rounded-2xl text-base"
            >
              <GPayMarkInline /> Pay {rupees} with Google Pay
            </a>
          )}

          {mobile && !p.merchant && (
            <div className="mt-3 rounded-2xl bg-crate p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.qrDataUrl} alt={`UPI QR code to pay ${rupees} to ${p.payeeName}`} width={220} height={220} className="mx-auto rounded-xl bg-white p-2" />
              {platform === "ios" ? (
                <p className="mt-3 text-center text-sm font-semibold">Press and hold the QR code → <b>Save to Photos</b> (or take a screenshot)</p>
              ) : (
                <a href={p.qrDataUrl} download={`salad-stories-${p.orderNumber}.png`} className="btn btn-primary mt-3 h-12 w-full rounded-2xl">
                  <Download className="h-4 w-4" /> Save QR code to phone
                </a>
              )}
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                <li>Open <b>Google Pay</b> → tap <b>Scan any QR code</b>.</li>
                <li>Tap the <b>photo / gallery</b> icon and pick the QR code you just saved.</li>
                <li>The amount <b>{rupees}</b> is filled in — check it and pay.</li>
              </ol>
              <p className="mt-2 text-xs text-ink-soft">Paying from another phone? Just scan the QR code above.</p>
            </div>
          )}

          {(platform === "desktop" || (showQr && p.merchant)) && (
            <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl bg-crate p-4 sm:flex-row sm:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.qrDataUrl} alt={`UPI QR code to pay ${rupees} to ${p.payeeName}`} width={200} height={200} className="rounded-xl bg-white p-2" />
              <div className="text-sm">
                <p className="font-semibold">Scan with Google Pay on your phone</p>
                <p className="mt-1 text-ink-soft">Open Google Pay → Scan QR code. The amount ({rupees}) fills in automatically.</p>
              </div>
            </div>
          )}

          {mobile && p.merchant && !showQr && (
            <button type="button" onClick={() => setShowQr(true)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-basil">
              <QrCode className="h-4 w-4" /> Paying from another phone? Show QR code
            </button>
          )}

          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
              <div>
                <dt className="text-xs text-ink-soft">Pay to UPI ID</dt>
                <dd className="font-semibold break-all">{p.upiId}</dd>
              </div>
              <button type="button" onClick={() => copy(p.upiId, "id")} className="shrink-0 rounded-lg p-2 hover:bg-crate" aria-label="Copy UPI ID">
                {copied === "id" ? <Check className="h-4 w-4 text-basil" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
              <div>
                <dt className="text-xs text-ink-soft">Exact amount</dt>
                <dd className="font-semibold">{rupees}</dd>
              </div>
              <button type="button" onClick={() => copy((p.amount / 100).toFixed(2), "amt")} className="shrink-0 rounded-lg p-2 hover:bg-crate" aria-label="Copy amount">
                {copied === "amt" ? <Check className="h-4 w-4 text-basil" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </dl>
        </li>

        <li>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-basil text-sm text-white">2</span>
            Enter the UPI transaction ID
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            After paying, Google Pay shows a 12-digit <b>UPI transaction ID</b> on the payment screen (also under the payment in your history). We use it to match your payment.
          </p>
          <form onSubmit={submit} className="mt-3 space-y-3">
            <label htmlFor="utr" className="sr-only">UPI transaction ID</label>
            <input
              id="utr"
              className="field text-lg tracking-widest"
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              placeholder="12-digit number"
              value={utr}
              onChange={(e) => setUtr(e.target.value.replace(/\D/g, "").slice(0, 12))}
              aria-invalid={!!error}
            />
            {error && <p className="text-sm font-semibold text-tomato" role="alert">{error}</p>}
            <button className="btn btn-primary h-14 w-full rounded-2xl text-base" disabled={utr.length !== 12 || busy}>
              {busy ? "Sending…" : "I've paid — confirm my order"}
            </button>
          </form>
        </li>
      </ol>
    </div>
  );
}

function GPayMarkInline() {
  return <Smartphone className="h-5 w-5" />;
}
