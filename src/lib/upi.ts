/**
 * Google Pay / UPI payments without a gateway.
 *
 * The customer pays the shop's UPI ID from Google Pay (button on phones, QR
 * code on computers), then types the 12-digit UPI transaction ID shown in
 * GPay. The owner checks the money arrived in their GPay/bank app and taps
 * "Payment received" in the admin. No fees; the trade-off is that the owner
 * confirms each payment by hand.
 */

export const UPI_ID_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
export const UTR_RE = /^\d{12}$/;

const GPAY_ANDROID_PACKAGE = "com.google.android.apps.nbu.paisa.user";

export interface UpiPayment {
  upiId: string;
  payeeName: string;
  amount: number; // paise
  orderNumber: string;
  /** Merchant category code from the business UPI QR (optional). */
  merchantCode?: string;
}

/** Amount, note and order reference are always filled in, so the customer can't pay the wrong amount. */
function query(p: UpiPayment) {
  const fields: Record<string, string> = {
    pa: p.upiId,
    pn: p.payeeName.slice(0, 50),
    am: (p.amount / 100).toFixed(2),
    cu: "INR",
    tn: `Salad Stories ${p.orderNumber}`,
    tr: p.orderNumber,
  };
  if (p.merchantCode && /^\d{4}$/.test(p.merchantCode)) fields.mc = p.merchantCode;
  const params = new URLSearchParams(fields);
  // UPI apps expect %20 rather than + for spaces.
  return params.toString().replace(/\+/g, "%20");
}

/**
 * Reads a UPI QR's text (e.g. "upi://pay?pa=shop@ybl&pn=Salad%20Stories&mc=5814")
 * so the owner can paste it instead of typing details.
 */
export function parseUpiLink(text: string) {
  const t = text.trim();
  const q = t.includes("?") ? t.slice(t.indexOf("?") + 1) : t;
  const p = new URLSearchParams(q);
  const pa = p.get("pa")?.trim().toLowerCase() ?? "";
  if (!UPI_ID_RE.test(pa)) return null;
  return { upiId: pa, payeeName: p.get("pn")?.trim() ?? "", merchantCode: /^\d{4}$/.test(p.get("mc") ?? "") ? p.get("mc")! : "" };
}

/** Standard UPI link — any UPI app (and every UPI QR scanner) understands it. */
export const upiUri = (p: UpiPayment) => `upi://pay?${query(p)}`;

/** Opens Google Pay directly on Android (falls back to the Play Store if not installed). */
export const gpayAndroidUri = (p: UpiPayment) =>
  `intent://pay?${query(p)}#Intent;scheme=upi;package=${GPAY_ANDROID_PACKAGE};end`;

/** Opens Google Pay directly on iPhone. */
export const gpayIosUri = (p: UpiPayment) => `gpay://upi/pay?${query(p)}`;
