const MESSAGES: Record<string, string> = {
  saved: "Changes saved.",
  deleted: "Deleted.",
  status: "Order status updated. The customer has been notified by email.",
  refunded: "Refund recorded.",
  upiConfirmed: "Payment confirmed. The order is now in the kitchen queue and the customer has been emailed.",
  upiRejected: "Marked as not received. The customer has been emailed and can pay again.",
  planSkipped: "Day skipped — it moved to the end of the plan.",
  planCancelled: "Plan cancelled. Its future days were removed from the kitchen sheet. Refund any unused days by hand (Google Pay / bank) if you've agreed to.",
  telegramConnected: "Telegram connected — check your phone for a hello message.",
  sent_wte: "Sent to your WhatsApp, Telegram and email.",
  sent_wt: "Sent to your WhatsApp and Telegram.",
  sent_we: "Sent to your WhatsApp and email.",
  sent_w: "Sent to your WhatsApp.",
  sent_te: "Sent to your Telegram and email.",
  sent_t: "Sent to your Telegram.",
  sent_e: "Sent to your email.",
};

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (err) return <p role="alert" className="mb-5 rounded-xl bg-tomato/10 p-3 text-sm font-semibold text-tomato">{err}</p>;
  if (msg) return <p role="status" className="mb-5 rounded-xl bg-basil-soft p-3 text-sm font-semibold text-basil-deep">{MESSAGES[msg] ?? msg}</p>;
  return null;
}
