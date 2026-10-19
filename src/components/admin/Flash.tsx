const MESSAGES: Record<string, string> = {
  saved: "Changes saved.",
  deleted: "Deleted.",
  status: "Order status updated. The customer has been notified by email.",
  refunded: "Refund recorded.",
  upiConfirmed: "Payment confirmed. The order is now in the kitchen queue and the customer has been emailed.",
  upiRejected: "Marked as not received. The customer has been emailed and can pay again.",
  telegramConnected: "Telegram connected — check your phone for a hello message.",
  sent_te: "Sent to your Telegram and email.",
  sent_t: "Sent to your Telegram.",
  sent_e: "Sent to your email.",
};

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (err) return <p role="alert" className="mb-5 rounded-xl bg-tomato/10 p-3 text-sm font-semibold text-tomato">{err}</p>;
  if (msg && MESSAGES[msg]) return <p role="status" className="mb-5 rounded-xl bg-basil-soft p-3 text-sm font-semibold text-basil-deep">{MESSAGES[msg]}</p>;
  return null;
}
