import Link from "next/link";
import { paymentStatusAction } from "@/app/admin/biz-actions";
import { Badge } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { METHOD_LABELS, type Payment } from "@/lib/biz/payments";
import { formatINR } from "@/lib/money";

const when = (d: Date) => new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/** Ledger rows with Verify / Not received / Reverse actions (admin). */
export function PaymentsList({ rows, returnTo, canEdit, names }: { rows: Payment[]; returnTo: string; canEdit: boolean; names?: Record<string, { name: string; href: string }> }) {
  if (!rows.length) return <p className="text-sm text-ink-soft">No payments yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((p) => (
        <li key={p.id} className="py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">
                {p.type === "REFUND" ? "Refund " : ""}{formatINR(p.amount)} · {METHOD_LABELS[p.method] ?? p.method}
                {names?.[p.customerId ?? ""] && <> · <Link href={names[p.customerId!].href} className="text-basil hover:underline">{names[p.customerId!].name}</Link></>}
              </p>
              <p className="text-xs text-ink-soft">
                {p.receiptNo} · {when(p.paidAt)}{p.reference ? ` · Ref ${p.reference}` : ""} · by {p.recordedBy}{p.verifiedBy && p.status === "RECEIVED" ? ` · checked by ${p.verifiedBy}` : ""}
              </p>
              {p.note && <p className="text-xs text-ink-soft">{p.note}</p>}
              {p.status === "RECEIVED" && <a href={`/api/admin/receipts/${p.id}/pdf`} className="text-xs font-semibold text-basil underline">Receipt PDF</a>}
            </div>
            <Badge value={p.status} />
          </div>
          {canEdit && p.status !== "REVERSED" && p.status !== "FAILED" && (
            <div className="mt-2 flex flex-wrap gap-2">
              {p.status === "PENDING_VERIFICATION" && (
                <>
                  <form action={paymentStatusAction}>
                    <input type="hidden" name="paymentId" value={p.id} /><input type="hidden" name="action" value="verify" /><input type="hidden" name="returnTo" value={returnTo} />
                    <SubmitButton className="btn btn-primary min-h-9 px-3 text-xs" pendingText="…">Money received</SubmitButton>
                  </form>
                  <form action={paymentStatusAction}>
                    <input type="hidden" name="paymentId" value={p.id} /><input type="hidden" name="action" value="fail" /><input type="hidden" name="returnTo" value={returnTo} />
                    <SubmitButton className="btn btn-ghost min-h-9 px-3 text-xs" pendingText="…" confirm="Mark this payment as not received?">Not received</SubmitButton>
                  </form>
                </>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer py-2 font-semibold text-ink-soft">Reverse (recorded by mistake)</summary>
                <form action={paymentStatusAction} className="mt-1 flex gap-2">
                  <input type="hidden" name="paymentId" value={p.id} /><input type="hidden" name="action" value="reverse" /><input type="hidden" name="returnTo" value={returnTo} />
                  <input name="reason" required minLength={3} placeholder="Reason" className="field min-h-9 py-1 text-xs" />
                  <SubmitButton className="btn btn-ghost min-h-9 px-3 text-xs text-tomato" confirm="Reverse this payment? It stays in the history, marked reversed.">Reverse</SubmitButton>
                </form>
              </details>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
