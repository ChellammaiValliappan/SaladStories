import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { CalendarPlus, MessageCircle, Phone } from "lucide-react";
import { db, deliverySlots, subscriptionDays } from "@/db";
import { requireStaff } from "@/lib/auth";
import { getCustomer } from "@/lib/biz/customers";
import { CUSTOMER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/biz/core";
import { historyFor } from "@/lib/biz/history";
import { INVOICE_STATUS_LABELS, listInvoices } from "@/lib/biz/invoices";
import { subscriptionSummary } from "@/lib/biz/subscriptions";
import { formatINR } from "@/lib/money";
import { addressLine } from "@/lib/notify";
import { slotLabelOf } from "@/lib/plans";
import { formatDateLong } from "@/lib/time";
import { saveCustomer, setCustomerStatus } from "../../../biz-actions";
import { Badge, Card, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { CustomerFields } from "@/components/admin/biz/CustomerFields";
import { PaymentForm } from "@/components/admin/biz/PaymentForm";
import { PaymentsList } from "@/components/admin/biz/PaymentsList";
import { History } from "@/components/admin/biz/History";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireStaff();
  const admin = me.role === "ADMIN";
  const { id } = await params;
  const sp = await searchParams;
  const data = await getCustomer(id);
  if (!data) notFound();
  const { customer: c, status, subscriptions: subs, payments: pays, orders: ords } = data;
  const open = subs.filter((s) => ["ACTIVE", "PAUSED", "PENDING_PAYMENT"].includes(s.status));
  const summaries = (await Promise.all(open.map((s) => subscriptionSummary(s.id)))).filter((x) => x !== null);
  const invs = admin ? await listInvoices({ customerId: c.id, limit: 50 }) : [];
  const slots = await db.select().from(deliverySlots).where(eq(deliverySlots.isActive, true)).orderBy(asc(deliverySlots.sortOrder));
  const dayIds = subs.length ? (await db.select({ id: subscriptionDays.id }).from(subscriptionDays).where(inArray(subscriptionDays.subscriptionId, subs.map((s) => s.id)))).map((d) => d.id) : [];
  const history = await historyFor([
    { entity: "customer", ids: [c.id] },
    { entity: "subscription", ids: subs.map((s) => s.id) },
    { entity: "payment", ids: pays.map((p) => p.id) },
    { entity: "day", ids: dayIds },
  ]);
  const wa = (c.whatsapp || c.phone).replace(/\D/g, "");
  const due = summaries.reduce((t, s) => t + s.money.due, 0);
  const paidTotal = pays.filter((p) => p.status === "RECEIVED").reduce((t, p) => t + (p.type === "REFUND" ? -p.amount : p.amount), 0);

  return (
    <>
      <PageHead title={c.name} back={{ href: "/admin/customers", label: "Customers" }}>
        <Badge value={status} />
      </PageHead>
      <Flash msg={sp.msg} err={sp.err} />
      <p className="-mt-3 mb-4 text-sm text-ink-soft">{c.code} · {CUSTOMER_STATUS_LABELS[status]} · customer since {new Date(c.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" })}</p>

      <div className="mb-6 flex flex-wrap gap-2">
        <a href={`tel:+91${c.phone}`} className="btn btn-ghost min-h-11 text-sm"><Phone className="h-4 w-4" /> Call</a>
        <a href={`https://wa.me/91${wa.slice(-10)}`} target="_blank" rel="noreferrer" className="btn btn-ghost min-h-11 text-sm"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
        {admin && <Link href={`/admin/subscriptions/new?customer=${c.id}`} className="btn btn-primary min-h-11 text-sm"><CalendarPlus className="h-4 w-4" /> New plan</Link>}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-4"><p className="text-sm font-semibold text-ink-soft">Paid so far</p><p className="font-display text-2xl font-[800]">{formatINR(paidTotal)}</p></div>
        <div className="rounded-2xl border border-line bg-white p-4"><p className="text-sm font-semibold text-ink-soft">Balance due</p><p className={`font-display text-2xl font-[800] ${due ? "text-tomato" : ""}`}>{formatINR(due)}</p></div>
        <div className="rounded-2xl border border-line bg-white p-4"><p className="text-sm font-semibold text-ink-soft">Plans</p><p className="font-display text-2xl font-[800]">{subs.length}</p></div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card title="Plans">
            {summaries.map(({ sub, stats, money, next }) => (
              <Link key={sub.id} href={`/admin/plans/${sub.id}`} className="mb-3 block rounded-2xl border-2 border-basil p-4 hover:bg-paper">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-bold">{sub.planName} · {sub.number}</p>
                  <div className="flex gap-1.5"><Badge value={sub.status} /><Badge value={money.status} /></div>
                </div>
                <p className="mt-1 text-sm">
                  {stats.delivered} of {stats.entitled} delivered · <b>{stats.remaining} remaining</b>
                  {stats.forfeited ? ` · ${stats.forfeited} forfeited` : ""}{stats.held ? ` · ${stats.held} waiting for your decision` : ""}
                </p>
                <p className="text-sm text-ink-soft">
                  {formatDateLong(sub.startDate)} – {formatDateLong(sub.endDate)}{next ? ` · next: Day ${next.number}, ${formatDateLong(next.date)}` : ""}
                </p>
                <p className="text-sm">{PAYMENT_STATUS_LABELS[money.status]}: {formatINR(money.net)} of {formatINR(sub.total)}{money.due ? <b className="text-tomato"> · due {formatINR(money.due)}</b> : ""}</p>
              </Link>
            ))}
            {subs.filter((s) => !open.some((o) => o.id === s.id)).map((s) => (
              <Link key={s.id} href={`/admin/plans/${s.id}`} className="flex items-center justify-between gap-3 border-t border-line py-3 text-sm hover:bg-paper">
                <span><b>{s.planName}</b> · {s.number} · {formatDateLong(s.startDate)} – {formatDateLong(s.actualEndDate ?? s.endDate)}</span>
                <Badge value={s.status} />
              </Link>
            ))}
            {subs.length === 0 && <p className="text-sm text-ink-soft">No plans yet.</p>}
          </Card>

          <Card title="Payments">
            <PaymentsList rows={pays} returnTo={`/admin/customers/${c.id}`} canEdit={admin} />
            {admin && (
              <details className="mt-4 rounded-2xl bg-crate p-4" open={!!summaries.find((s) => s.money.due > 0) && !pays.length}>
                <summary className="cursor-pointer font-semibold">Record a payment</summary>
                <div className="mt-3">
                  {summaries.length > 0 && <p className="mb-2 text-sm text-ink-soft">This goes to {summaries[0].sub.planName} plan {summaries[0].sub.number}.</p>}
                  <PaymentForm customerId={c.id} subscriptionId={summaries[0]?.sub.id ?? null} suggested={summaries[0]?.money.due} returnTo={`/admin/customers/${c.id}`} />
                </div>
              </details>
            )}
          </Card>

          {invs.length > 0 && (
            <Card title="Invoices">
              <ul className="divide-y divide-line text-sm">
                {invs.map((i) => (
                  <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <Link href={`/admin/invoices/${i.id}`} className="font-semibold text-basil hover:underline">{i.number}</Link>
                    <span className="text-ink-soft">{i.kind === "CREDIT_NOTE" ? "Credit note" : INVOICE_STATUS_LABELS[i.status]}</span>
                    <span className="font-semibold">{i.kind === "CREDIT_NOTE" ? "− " : ""}{formatINR(i.total)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {ords.length > 0 && (
            <Card title="One-off orders">
              <ul className="divide-y divide-line text-sm">
                {ords.map((o) => (
                  <li key={o.id} className="flex justify-between gap-3 py-2">
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold text-basil hover:underline">{o.orderNumber}</Link>
                    <span className="text-ink-soft">{o.slotLabel}</span>
                    <span className="font-semibold">{formatINR(o.total)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="History">
            <History rows={history} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-ink-soft">Mobile</dt><dd className="font-semibold">{c.phone}{c.whatsapp && c.whatsapp !== c.phone ? ` · WhatsApp ${c.whatsapp}` : ""}</dd></div>
              {c.email && <div><dt className="text-ink-soft">Email</dt><dd>{c.email}</dd></div>}
              <div><dt className="text-ink-soft">Address</dt><dd>{c.address?.house ? addressLine(c.address) : <span className="text-tomato">Not added yet</span>}</dd></div>
              {c.preferredSlotId && <div><dt className="text-ink-soft">Preferred time</dt><dd>{slots.find((s) => s.id === c.preferredSlotId) ? slotLabelOf(slots.find((s) => s.id === c.preferredSlotId)!) : "—"}</dd></div>}
              {c.foodPreferences && <div><dt className="text-ink-soft">Food preferences</dt><dd>{c.foodPreferences}</dd></div>}
              {c.instructions && <div><dt className="text-ink-soft">Instructions</dt><dd>{c.instructions}</dd></div>}
              {c.notes && <div><dt className="text-ink-soft">Notes</dt><dd className="whitespace-pre-wrap">{c.notes}</dd></div>}
            </dl>
            {admin && (
              <details className="mt-4">
                <summary className="cursor-pointer font-semibold text-basil">Edit details</summary>
                <form action={saveCustomer} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={c.id} />
                  <CustomerFields c={c} slots={slots.map((s) => ({ id: s.id, label: slotLabelOf(s) }))} />
                  <SubmitButton className="btn btn-primary w-full">Save changes</SubmitButton>
                </form>
              </details>
            )}
          </Card>
          {admin && (
            <Card title="Customer status">
              <p className="mb-3 text-sm text-ink-soft">Status follows their plans automatically. Override it only if they&apos;ve asked to pause or stop.</p>
              <form action={setCustomerStatus} className="space-y-2">
                <input type="hidden" name="id" value={c.id} />
                <select name="status" defaultValue={c.manualStatus ?? ""} className="field">
                  <option value="">Automatic (from plans)</option>
                  <option value="PAUSED">Paused</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <input name="reason" placeholder="Reason (kept in history)" className="field" />
                <SubmitButton className="btn btn-ghost w-full">Update status</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
