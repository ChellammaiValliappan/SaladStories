type Row = { id: string; entity: string; action: string; reason: string; actorName: string; createdAt: Date; after: unknown; before: unknown };

const LABEL: Record<string, string> = { customer: "Customer", subscription: "Plan", day: "Delivery day", payment: "Payment", invoice: "Invoice", expense: "Expense", request: "Request", plan: "Plan settings" };

function brief(v: unknown) {
  if (!v || typeof v !== "object") return "";
  const o = v as Record<string, unknown>;
  const keys = ["status", "bowl", "date", "finalDate", "receiptNo", "amount", "number", "plan", "manualStatus", "endDate"];
  return keys
    .filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== "")
    .map((k) => `${k === "amount" ? "₹" + (Number(o[k]) / 100).toFixed(2) : String(o[k])}`)
    .slice(0, 3)
    .join(" · ");
}

/** Who did what, when and why. */
export function History({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="text-sm text-ink-soft">Nothing yet.</p>;
  return (
    <ol className="space-y-3 text-sm">
      {rows.map((r) => {
        const before = brief(r.before);
        const after = brief(r.after);
        return (
          <li key={r.id} className="border-l-2 border-line pl-3">
            <p>
              <b>{LABEL[r.entity] ?? r.entity}</b> {r.action}
              {before || after ? <span className="text-ink-soft"> — {before && after && before !== after ? `${before} → ${after}` : after || before}</span> : null}
            </p>
            {r.reason && <p className="text-ink-soft">Reason: {r.reason}</p>}
            <p className="text-xs text-ink-soft">
              {r.actorName} · {new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
