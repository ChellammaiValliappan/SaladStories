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
}

function query(p: UpiPayment) {
  const params = new URLSearchParams({
    pa: p.upiId,
    pn: p.payeeName.slice(0, 50),
    am: (p.amount / 100).toFixed(2),
    cu: "INR",
    tn: `Salad Stories ${p.orderNumber}`,
    tr: p.orderNumber,
  });
  // UPI apps expect %20 rather than + for spaces.
  return params.toString().replace(/\+/g, "%20");
}

/** Standard UPI link — any UPI app (and every UPI QR scanner) understands it. */
export const upiUri = (p: UpiPayment) => `upi://pay?${query(p)}`;

/** Opens Google Pay directly on Android (falls back to the Play Store if not installed). */
export const gpayAndroidUri = (p: UpiPayment) =>
  `intent://pay?${query(p)}#Intent;scheme=upi;package=${GPAY_ANDROID_PACKAGE};end`;

/** Opens Google Pay directly on iPhone. */
export const gpayIosUri = (p: UpiPayment) => `gpay://upi/pay?${query(p)}`;
