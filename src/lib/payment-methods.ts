/** Razorpay Checkout method codes the owner can switch on/off in Settings. */
export const PAYMENT_METHODS = [
  { code: "upi", label: "UPI (Google Pay, PhonePe, Paytm…)" },
  { code: "card", label: "Credit and debit cards" },
  { code: "netbanking", label: "Net banking" },
  { code: "wallet", label: "Wallets" },
  { code: "emi", label: "EMI" },
  { code: "paylater", label: "Pay later" },
] as const;

export const SHORT_LABELS: Record<string, string> = {
  upi: "UPI",
  card: "cards",
  netbanking: "net banking",
  wallet: "wallets",
  emi: "EMI",
  paylater: "pay later",
};

export function parseMethods(csv: string) {
  const on = csv.split(",").map((s) => s.trim()).filter(Boolean);
  return PAYMENT_METHODS.map((m) => m.code).filter((c) => on.includes(c));
}

/** Methods to hide in Razorpay Checkout (config.display.hide). */
export function hiddenMethods(csv: string) {
  const on = parseMethods(csv);
  return PAYMENT_METHODS.map((m) => m.code).filter((c) => !on.includes(c));
}

export function methodsSentence(csv: string) {
  const labels = parseMethods(csv).map((c) => SHORT_LABELS[c]);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}
