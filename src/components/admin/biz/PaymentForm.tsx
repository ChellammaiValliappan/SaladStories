import { recordPaymentAction } from "@/app/admin/biz-actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { METHOD_LABELS } from "@/lib/biz/payments";
import { istParts } from "@/lib/time";

/** "Record payment" — cash, UPI, bank… Money only counts once marked received. */
export function PaymentForm({ customerId, subscriptionId, orderId, suggested, returnTo }: { customerId: string; subscriptionId?: string | null; orderId?: string | null; suggested?: number; returnTo: string }) {
  return (
    <form action={recordPaymentAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="customerId" value={customerId} />
      {subscriptionId && <input type="hidden" name="subscriptionId" value={subscriptionId} />}
      {orderId && <input type="hidden" name="orderId" value={orderId} />}
      <input type="hidden" name="returnTo" value={returnTo} />
      <div>
        <label className="label" htmlFor="pay-amount">Amount (₹)</label>
        <input id="pay-amount" name="amount" type="number" step="0.01" min="1" required inputMode="decimal" defaultValue={suggested ? (suggested / 100).toFixed(2) : ""} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="pay-method">Method</label>
        <select id="pay-method" name="method" className="field" defaultValue="UPI">
          {Object.entries(METHOD_LABELS).filter(([k]) => k !== "RAZORPAY").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="pay-ref">Reference <span className="font-normal text-ink-soft">(UPI 12-digit ID, cheque no.)</span></label>
        <input id="pay-ref" name="reference" className="field" autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="pay-date">Date received</label>
        <input id="pay-date" name="paidAt" type="date" defaultValue={istParts().dateStr} max={istParts().dateStr} className="field" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="pay-note">Note (optional)</label>
        <input id="pay-note" name="note" className="field" />
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="radio" name="status" value="RECEIVED" defaultChecked className="h-4 w-4 accent-[#1f6b3a]" /> Money received
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="radio" name="status" value="PENDING_VERIFICATION" className="h-4 w-4 accent-[#1f6b3a]" /> Check later
        </label>
        <SubmitButton className="btn btn-primary ml-auto" pendingText="Saving…">Record payment</SubmitButton>
      </div>
    </form>
  );
}
