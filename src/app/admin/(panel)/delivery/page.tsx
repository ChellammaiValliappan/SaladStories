import { requireAdmin } from "@/lib/auth";
import { asc, desc, gte } from "drizzle-orm";
import { blackoutDates, db, deliveryAreas, deliveryInterests, deliverySlots } from "@/db";
import { istParts } from "@/lib/time";
import { addBlackout, deleteArea, deleteBlackout, deleteInterest, deleteSlot, saveArea, saveSlot } from "../../actions";
import { Card, Check, Field, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

export const metadata = { title: "Delivery" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Area = typeof deliveryAreas.$inferSelect;
type Slot = typeof deliverySlots.$inferSelect;

function AreaForm({ a }: { a?: Area }) {
  return (
    <form action={saveArea} className="grid items-end gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_7rem_7rem_auto]">
      {a && <input type="hidden" name="id" value={a.id} />}
      <Field label="Area" name="name" defaultValue={a?.name} required />
      <Field label="PIN codes" name="pincodes" defaultValue={a?.pincodes} required hint="Comma separated" />
      <Field label="Fee (₹)" name="fee" type="number" step="0.01" defaultValue={a?.fee != null ? a.fee / 100 : ""} hint="Blank = standard" />
      <Field label="Min order (₹)" name="minOrder" type="number" step="0.01" defaultValue={a?.minOrder != null ? a.minOrder / 100 : ""} />
      <div className="flex items-center gap-3 pb-2">
        <Check label="Active" name="isActive" defaultChecked={a?.isActive ?? true} />
        <input type="hidden" name="sortOrder" value={a?.sortOrder ?? 0} />
        <SubmitButton className="btn btn-primary min-h-10 px-4 text-sm">{a ? "Save" : "Add area"}</SubmitButton>
      </div>
    </form>
  );
}

function SlotForm({ s }: { s?: Slot }) {
  const days = (s?.daysOfWeek ?? "0,1,2,3,4,5,6").split(",");
  return (
    <form action={saveSlot} className="grid items-end gap-3 rounded-xl border border-line p-3 sm:grid-cols-6">
      {s && <input type="hidden" name="id" value={s.id} />}
      <Field label="Name" name="name" defaultValue={s?.name} required placeholder="e.g. Lunch" className="sm:col-span-2" />
      <Field label="Starts" name="startTime" type="time" defaultValue={s?.startTime} required />
      <Field label="Ends" name="endTime" type="time" defaultValue={s?.endTime} required />
      <Field label="Cut-off (min before)" name="cutoffMinutes" type="number" defaultValue={s?.cutoffMinutes ?? 60} />
      <Field label="Max orders" name="maxOrders" type="number" defaultValue={s?.maxOrders ?? 20} />
      <fieldset className="sm:col-span-4">
        <legend className="label">Runs on</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1.5"><input type="checkbox" name="days" value={i} defaultChecked={days.includes(String(i))} className="accent-[#1f6b3a]" />{d}</label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3 sm:col-span-2 sm:justify-end">
        <Check label="Active" name="isActive" defaultChecked={s?.isActive ?? true} />
        <input type="hidden" name="sortOrder" value={s?.sortOrder ?? 0} />
        <SubmitButton className="btn btn-primary min-h-10 px-4 text-sm">{s ? "Save" : "Add slot"}</SubmitButton>
      </div>
    </form>
  );
}

export default async function DeliveryPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [areas, slots, blackouts, interest] = await Promise.all([
    db.select().from(deliveryAreas).orderBy(asc(deliveryAreas.sortOrder), asc(deliveryAreas.name)),
    db.select().from(deliverySlots).orderBy(asc(deliverySlots.sortOrder), asc(deliverySlots.startTime)),
    db.select().from(blackoutDates).where(gte(blackoutDates.date, istParts().dateStr)).orderBy(asc(blackoutDates.date)),
    db.select().from(deliveryInterests).orderBy(desc(deliveryInterests.createdAt)).limit(100),
  ]);

  return (
    <>
      <PageHead title="Delivery" />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="space-y-6">
        <Card title="Delivery areas">
          <p className="mb-3 text-sm text-ink-soft">Customers can only order to the PIN codes listed in active areas. The standard fee is set in Settings.</p>
          <div className="space-y-3">
            {areas.map((a) => (
              <div key={a.id} className="space-y-1">
                <AreaForm a={a} />
                <form action={deleteArea} className="text-right">
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton className="text-xs font-semibold text-tomato hover:underline" confirm={`Remove ${a.name}?`} pendingText="…">Remove {a.name}</SubmitButton>
                </form>
              </div>
            ))}
            <AreaForm />
          </div>
        </Card>

        <Card title="Delivery slots">
          <p className="mb-3 text-sm text-ink-soft">Times are in IST. Orders close at the cut-off before each slot, and a slot closes when it reaches its maximum orders.</p>
          <div className="space-y-3">
            {slots.map((s) => (
              <div key={s.id} className="space-y-1">
                <SlotForm s={s} />
                <form action={deleteSlot} className="text-right">
                  <input type="hidden" name="id" value={s.id} />
                  <SubmitButton className="text-xs font-semibold text-tomato hover:underline" confirm={`Remove the ${s.name} slot?`} pendingText="…">Remove {s.name}</SubmitButton>
                </form>
              </div>
            ))}
            <SlotForm />
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Holidays and closed days">
            <form action={addBlackout} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Date" name="date" type="date" required />
              <Field label="Reason (optional)" name="reason" placeholder="e.g. Pongal" />
              <SubmitButton className="btn btn-primary min-h-12 px-4 text-sm">Close this day</SubmitButton>
            </form>
            <ul className="mt-4 divide-y divide-line text-sm">
              {blackouts.length === 0 && <li className="py-2 text-ink-soft">No upcoming closed days.</li>}
              {blackouts.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <span><span className="font-semibold">{b.date}</span> {b.reason && `— ${b.reason}`}</span>
                  <form action={deleteBlackout}><input type="hidden" name="id" value={b.id} /><button className="font-semibold text-tomato">Reopen</button></form>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Requests from new areas">
            <p className="mb-3 text-sm text-ink-soft">People outside your delivery area who asked to be told when you arrive.</p>
            <ul className="divide-y divide-line text-sm">
              {interest.length === 0 && <li className="py-2 text-ink-soft">No requests yet.</li>}
              {interest.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                  <span><span className="font-semibold">{i.pincode}</span> · {i.name || "—"} · <a href={`tel:${i.phone}`} className="text-basil">{i.phone}</a></span>
                  <form action={deleteInterest}><input type="hidden" name="id" value={i.id} /><button className="text-xs font-semibold text-ink-soft">Remove</button></form>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
