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
  /** Merchant category code from a business UPI QR (optional). */
  merchantCode?: string;
  /**
   * Extra fields copied from the owner's own QR code (e.g. Google Pay's "aid").
   * Payment apps check these, so links built from the owner's real QR are
   * accepted where hand-built ones are refused.
   */
  qrExtras?: Record<string, string>;
}

/** Fields we always set ourselves, never copied from a pasted QR. */
const OWN_FIELDS = new Set(["pa", "pn", "am", "cu", "tn", "tr", "mc", "url", "mam"]);

/**
 * The amount and an order note are always filled in.
 * Personal UPI IDs get the same fields Google Pay's own "pay a friend" QR has
 * (no shop-only fields), with the account holder's exact name; a transaction
 * reference is only added for business (merchant) UPI IDs.
 */
function query(p: UpiPayment) {
  const merchant = !!p.merchantCode && /^\d{4}$/.test(p.merchantCode);
  const fields: Record<string, string> = { pa: p.upiId, pn: p.payeeName.slice(0, 99) };
  for (const [k, v] of Object.entries(p.qrExtras ?? {})) if (!OWN_FIELDS.has(k)) fields[k] = v;
  if (merchant) fields.mc = p.merchantCode!;
  fields.am = (p.amount / 100).toFixed(2);
  fields.cu = "INR";
  fields.tn = `Salad Stories ${p.orderNumber}`;
  if (merchant) fields.tr = p.orderNumber;
  const params = new URLSearchParams(fields);
  // UPI apps expect %20 rather than + for spaces.
  return params.toString().replace(/\+/g, "%20");
}

/**
 * Reads a UPI QR's text (e.g. "upi://pay?pa=name@oksbi&pn=Asha%20R&aid=uGICAg…")
 * so the owner can paste it instead of typing details. Keeps any extra fields.
 */
export function parseUpiLink(text: string) {
  const t = text.trim();
  const q = t.includes("?") ? t.slice(t.indexOf("?") + 1) : t;
  const p = new URLSearchParams(q);
  const pa = p.get("pa")?.trim().toLowerCase() ?? "";
  if (!UPI_ID_RE.test(pa)) return null;
  const extras: Record<string, string> = {};
  for (const [k, v] of p.entries()) if (!OWN_FIELDS.has(k) && /^[a-zA-Z]{1,12}$/.test(k) && v.length <= 200) extras[k] = v;
  return {
    upiId: pa,
    payeeName: p.get("pn")?.trim() ?? "",
    merchantCode: /^\d{4}$/.test(p.get("mc") ?? "") ? p.get("mc")! : "",
    extras,
  };
}

/** Standard UPI link — any UPI app (and every UPI QR scanner) understands it. */
export const upiUri = (p: UpiPayment) => `upi://pay?${query(p)}`;

/** Opens Google Pay directly on Android (falls back to the Play Store if not installed). */
export const gpayAndroidUri = (p: UpiPayment) =>
  `intent://pay?${query(p)}#Intent;scheme=upi;package=${GPAY_ANDROID_PACKAGE};end`;

/** Opens Google Pay directly on iPhone. */
export const gpayIosUri = (p: UpiPayment) => `gpay://upi/pay?${query(p)}`;
