import Link from "next/link";
import { and, count, desc, eq, gte, inArray, sql, sum } from "drizzle-orm";
import { db, deliverySlots, orderEvents, orders, payments, subscriptions } from "@/db";
import { CalendarPlus, CalendarRange, IndianRupee, Inbox, Receipt, UserPlus } from "lucide-react";
import { attentionItems, deliveryList } from "@/lib/biz/daily";
import { PushToggle } from "@/components/admin/PushToggle";
import { pushConfigured, pushPublicKey } from "@/lib/push";
import { formatINR } from "@/lib/money";
import { addDays, istParts } from "@/lib/time";
import { ACTIVE_ORDER_STATUSES } from "@/lib/delivery";
import { razorpayConfigured } from "@/lib/razorpay";
import { Badge, Card, PageHead, orderBadge } from "@/components/admin/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SetupChecklist } from "@/components/admin/SetupChecklist";
import { Flash } from "@/components/admin/Flash";
import { getCurrentUser } from "@/lib/auth";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const me = await getCurrentUser();
  const today = istParts().dateStr;
  const startOfToday = new Date(`${today}T00:00:00+05:30`);
  const weekAgo = new Date(`${addDays(today, -6)}T00:00:00+05:30`);

  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const tomorrow = addDays(today, 1);
  const net = sql<number>`coalesce(sum(case when ${payments.type} = 'REFUND' then -${payments.amount} else ${payments.amount} end), 0)::int`;
  const [tomorrowList, [plansNow], [moneyToday], [moneyWeek], [due]] = await Promise.all([
    deliveryList(tomorrow),
    db
      .select({ active: sql<number>`count(*) filter (where ${subscriptions.status} = 'ACTIVE')::int`, waiting: sql<number>`count(*) filter (where ${subscriptions.status} = 'PENDING_PAYMENT')::int`, paused: sql<number>`count(*) filter (where ${subscriptions.status} = 'PAUSED')::int` })
      .from(subscriptions),
    db
      .select({ v: sql<number>`coalesce(sum(case when ${payments.type} = 'REFUND' then -${payments.amount} else ${payments.amount} end), 0)::int` })
      .from(payments)
      .where(and(eq(payments.status, "RECEIVED"), gte(payments.paidAt, startOfToday))),
    db.select({ v: net }).from(payments).where(and(eq(payments.status, "RECEIVED"), gte(payments.paidAt, weekAgo))),
    db.execute<{ v: number; n: number }>(sql`
      select coalesce(sum(greatest(s.total - coalesce(p.net, 0), 0)), 0)::int as v, count(*) filter (where s.total > coalesce(p.net, 0))::int as n
      from subscriptions s
      left join (select subscription_id, sum(case when type = 'REFUND' then -amount else amount end) as net from payments where status = 'RECEIVED' group by subscription_id) p on p.subscription_id = s.id
      where s.status in ('ACTIVE', 'PENDING_PAYMENT', 'PAUSED')`).then((r) => ("rows" in r ? r.rows : r) as { v: number; n: number }[]),
  ]);
  const attention = await attentionItems(tomorrow, tomorrowList);
  const [[todayStats], [weekStats], toPrepare, [toVerify], recent, slots, todayBySlot, missedAlerts] = await Promise.all([
    db.select({ n: count(), revenue: sum(orders.total) }).from(orders).where(and(eq(orders.paymentStatus, "PAID"), gte(orders.createdAt, startOfToday))),
    db.select({ n: count(), revenue: sum(orders.total) }).from(orders).where(and(eq(orders.paymentStatus, "PAID"), gte(orders.createdAt, weekAgo))),
    db.select({ n: count() }).from(orders).where(inArray(orders.status, ["PAID", "PREPARING"])),
    db.select({ n: count() }).from(orders).where(and(eq(orders.paymentStatus, "VERIFYING"), eq(orders.status, "PENDING_PAYMENT"))),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(8),
    db.select().from(deliverySlots).where(eq(deliverySlots.isActive, true)),
    db
      .select({ slotId: orders.slotId, n: count() })
      .from(orders)
      .where(and(eq(orders.deliveryDate, today), inArray(orders.status, ACTIVE_ORDER_STATUSES)))
      .groupBy(orders.slotId),
    db
      .select({ orderId: orderEvents.orderId, orderNumber: orders.orderNumber, note: orderEvents.note })
      .from(orderEvents)
      .innerJoin(orders, eq(orders.id, orderEvents.orderId))
      .where(and(eq(orderEvents.status, "ALERT_FAILED"), gte(orderEvents.createdAt, dayAgo)))
      .orderBy(desc(orderEvents.createdAt))
      .limit(5),
  ]);

  const admin = me?.role === "ADMIN";
  const tiles = [
    { label: "Tomorrow's deliveries", value: String(tomorrowList.length), sub: `${tomorrowList.filter((e) => e.plan).length} from plans`, href: `/admin/schedule?date=${tomorrow}` },
    { label: "To prepare / dispatch", value: String(toPrepare[0].n), sub: "right now", href: "/admin/orders?status=open" },
    { label: "Active meal plans", value: String(plansNow.active), sub: [plansNow.waiting && `${plansNow.waiting} waiting for payment`, plansNow.paused && `${plansNow.paused} paused`].filter(Boolean).join(" · ") || "all running", href: "/admin/plans" },
    ...(admin
      ? [
          { label: "Money received today", value: formatINR(Number(moneyToday.v)), sub: `${todayStats.n} paid order${Number(todayStats.n) === 1 ? "" : "s"} · last 7 days ${formatINR(Number(moneyWeek.v))}`, href: "/admin/payments" },
          { label: "Due on plans", value: formatINR(Number(due?.v ?? 0)), sub: `${due?.n ?? 0} plan${due?.n === 1 ? "" : "s"} not fully paid`, href: "/admin/payments" },
        ]
      : []),
  ];
  const actions = [
    { href: "/admin/customers/new", label: "Add customer", icon: UserPlus, show: admin },
    { href: "/admin/customers", label: "New plan", icon: CalendarPlus, show: admin },
    { href: "/admin/payments", label: "Record payment", icon: IndianRupee, show: admin },
    { href: `/admin/schedule?date=${tomorrow}`, label: "Tomorrow's list", icon: CalendarRange, show: true },
    { href: "/admin/requests", label: "Skip requests", icon: Inbox, show: true },
    { href: "/admin/expenses?add=1", label: "Add expense", icon: Receipt, show: true },
  ].filter((a) => a.show);

  return (
    <>
      <PageHead title="Dashboard" />
      <AutoRefresh seconds={30} forMinutes={600} />
      <Flash err={err} />
      {pushConfigured() && <PushToggle publicKey={pushPublicKey()} compact />}
      {missedAlerts.length > 0 && (
        <div className="mb-5 rounded-2xl border-2 border-tomato bg-white p-4">
          <p className="font-semibold">⚠️ WhatsApp didn&apos;t deliver {missedAlerts.length === 1 ? "this alert" : `${missedAlerts.length} alerts`} (last 24 hours):</p>
          <ul className="mt-1 text-sm">
            {missedAlerts.map((a, i) => (
              <li key={i}>
                <Link className="font-semibold text-basil underline" href={`/admin/orders/${a.orderId}`}>{a.orderNumber}</Link> — {a.note}
              </li>
            ))}
          </ul>
        </div>
      )}
      {Number(toVerify.n) > 0 && (
        <Link href="/admin/orders?status=verify" className="mb-5 flex items-center justify-between gap-3 rounded-2xl border-2 border-carrot bg-white p-4 font-semibold">
          <span>{toVerify.n} Google Pay payment{Number(toVerify.n) === 1 ? "" : "s"} to check</span>
          <span className="text-basil">Check now</span>
        </Link>
      )}
      <nav aria-label="Quick actions" className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {actions.map((a) => (
          <Link key={a.label} href={a.href} className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-white p-3 text-center text-xs font-semibold hover:border-basil sm:text-sm">
            <a.icon className="h-5 w-5 text-basil" /> {a.label}
          </Link>
        ))}
      </nav>
      {attention.length > 0 && (
        <Card title={`Needs attention before tomorrow (${attention.length})`} className="mb-5 border-2 border-carrot">
          <ul className="space-y-1.5 text-sm">
            {attention.slice(0, 8).map((a, i) => (
              <li key={i}><Link href={a.link} className="font-semibold hover:text-basil hover:underline">{a.text}</Link></li>
            ))}
          </ul>
          {attention.length > 8 && <Link href={`/admin/schedule?date=${tomorrow}`} className="mt-2 inline-block text-sm font-semibold text-basil">See all</Link>}
        </Card>
      )}
      {me?.role === "ADMIN" ? <SetupChecklist /> : !razorpayConfigured() && (
        <p className="mb-5 rounded-xl bg-mango/25 p-4 text-sm font-medium">Online payments aren't switched on yet.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map((t) => {
          const inner = (
            <>
              <p className="text-sm font-semibold text-ink-soft">{t.label}</p>
              <p className="mt-1 font-display text-3xl font-[800]">{t.value}</p>
              {"sub" in t && t.sub && <p className="mt-0.5 text-xs text-ink-soft">{t.sub}</p>}
            </>
          );
          return t.href ? (
            <Link key={t.label} href={t.href} className="rounded-2xl border border-line bg-white p-5 hover:border-basil">{inner}</Link>
          ) : (
            <div key={t.label} className="rounded-2xl border border-line bg-white p-5">{inner}</div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card title="Latest orders" actions={<Link href="/admin/orders" className="text-sm font-semibold text-basil">All orders</Link>}>
          {recent.length === 0 ? (
            <p className="text-ink-soft">No orders yet. They'll appear here as soon as customers check out.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-paper">
                    <div className="min-w-0">
                      <p className="font-bold">{o.orderNumber} <span className="font-normal text-ink-soft">· {o.customerName}</span></p>
                      <p className="truncate text-sm text-ink-soft">{o.slotLabel}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold">{formatINR(o.total)}</p>
                      <Badge value={orderBadge(o)} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Today's slots">
          <ul className="space-y-3">
            {slots.map((s) => {
              const used = todayBySlot.find((x) => x.slotId === s.id)?.n ?? 0;
              const pct = Math.min(100, Math.round((Number(used) / s.maxOrders) * 100));
              return (
                <li key={s.id}>
                  <div className="flex justify-between text-sm"><span className="font-semibold">{s.name}</span><span>{used} / {s.maxOrders}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-crate"><div className="h-2 rounded-full bg-basil" style={{ width: `${pct}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
