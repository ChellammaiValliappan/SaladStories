import { decideRequestAction, skipNowAction } from "@/app/admin/biz-actions";
import { SubmitButton } from "@/components/admin/SubmitButton";

/**
 * The owner's choice for a skipped day: move it to a date, add it to the end,
 * forfeit it, or (for pending requests) decline and keep the delivery.
 */
export function DecisionForm(props: { mode: "decide"; requestId: string; suggestedEnd: string | null; requested?: string | null; returnTo: string } | { mode: "now"; subscriptionId: string; dayId: string; suggestedEnd: string | null }) {
  const isNow = props.mode === "now";
  return (
    <form action={isNow ? skipNowAction : decideRequestAction} className="grid gap-2 text-sm">
      {props.mode === "decide" ? (
        <>
          <input type="hidden" name="requestId" value={props.requestId} />
          <input type="hidden" name="returnTo" value={props.returnTo} />
        </>
      ) : (
        <>
          <input type="hidden" name="subscriptionId" value={props.subscriptionId} />
          <input type="hidden" name="dayId" value={props.dayId} />
        </>
      )}
      <fieldset className="grid gap-1.5">
        <legend className="sr-only">Decision</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="outcome" value="RESCHEDULED" defaultChecked={!!(props.mode === "decide" && props.requested)} className="h-4 w-4 accent-[#1f6b3a]" />
          Move to
          <input type="date" name="date" defaultValue={props.mode === "decide" ? props.requested ?? "" : ""} className="field min-h-9 w-40 py-1 text-sm" aria-label="New date" />
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="outcome" value="CARRIED_FORWARD" defaultChecked={!(props.mode === "decide" && props.requested)} className="h-4 w-4 accent-[#1f6b3a]" />
          Add to the end of the plan{props.suggestedEnd ? <span className="text-ink-soft">({props.suggestedEnd})</span> : null}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="outcome" value="FORFEITED" className="h-4 w-4 accent-[#1f6b3a]" />
          Forfeit (not delivered, still counts as used)
        </label>
        {!isNow && (
          <label className="flex items-center gap-2">
            <input type="radio" name="outcome" value="RESTORED" className="h-4 w-4 accent-[#1f6b3a]" />
            Decline — keep the original delivery
          </label>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-xs text-ink-soft">
        <input type="checkbox" name="allowDuplicate" className="h-4 w-4 accent-[#1f6b3a]" /> Allow two deliveries on the same day (exception)
      </label>
      <div className="flex flex-wrap gap-2">
        <input name={isNow ? "reason" : "note"} required={isNow} minLength={isNow ? 3 : undefined} placeholder={isNow ? "Reason (from the customer's message)" : "Note (optional)"} className="field min-h-10 flex-1 py-1.5 text-sm" />
        <SubmitButton className="btn btn-primary min-h-10 px-4 text-sm" pendingText="Saving…">{isNow ? "Skip day" : "Decide"}</SubmitButton>
      </div>
    </form>
  );
}
