const MESSAGES: Record<string, string> = {
  saved: "Changes saved.",
  deleted: "Deleted.",
  status: "Order status updated. The customer has been notified by email.",
  refunded: "Refund recorded.",
};

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (err) return <p role="alert" className="mb-5 rounded-xl bg-tomato/10 p-3 text-sm font-semibold text-tomato">{err}</p>;
  if (msg && MESSAGES[msg]) return <p role="status" className="mb-5 rounded-xl bg-basil-soft p-3 text-sm font-semibold text-basil-deep">{MESSAGES[msg]}</p>;
  return null;
}
