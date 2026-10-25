import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { addDays, istParts } from "../time";
import { financialYear } from "./invoices";

const rowsOf = <T,>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));
const n = (v: unknown) => Number(v ?? 0);
const dayStart = (d: string) => `${d}T00:00:00+05:30`;
const dayEnd = (d: string) => `${d}T23:59:59.999+05:30`;

export type Period = { from: string; to: string; label: string; key: string };

/** Named periods for the finance page. */
export function periodFor(key: string | undefined, from?: string, to?: string): Period {
  const today = istParts().dateStr;
  const month = today.slice(0, 7);
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  if (key === "custom" && valid(from) && valid(to)) return { from: valid(from)! <= valid(to)! ? from! : to!, to: valid(from)! <= valid(to)! ? to! : from!, label: "Custom", key };
  if (key === "last-month") {
    const first = `${month}-01`;
    const lastEnd = addDays(first, -1);
    return { from: `${lastEnd.slice(0, 7)}-01`, to: lastEnd, label: "Last month", key };
  }
  if (key === "7d") return { from: addDays(today, -6), to: today, label: "Last 7 days", key };
  if (key === "30d") return { from: addDays(today, -29), to: today, label: "Last 30 days", key };
  if (key === "fy") {
    const fy = financialYear(today);
    return { from: `20${fy.slice(0, 2)}-04-01`, to: today, label: `This financial year (${fy})`, key };
  }
  return { from: `${month}-01`, to: today, label: "This month", key: "month" };
}

/**
 * Everything on the finance page for a date range (IST).
 * - Sales are what was invoiced (minus credit notes), so a plan counts when it's billed.
 * - Collections are money actually received (minus refunds), by the date it arrived.
 * - Operating profit (estimate) = sales before tax − expenses. It ignores stock on hand and
 *   advance payments, so treat it as a guide, not accounts.
 */
export async function financeSummary(from: string, to: string) {
  const [sales] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select
        coalesce(sum(total) filter (where kind = 'INVOICE'), 0) as invoiced,
        coalesce(sum(tax) filter (where kind = 'INVOICE'), 0) as invoiced_tax,
        count(*) filter (where kind = 'INVOICE') as invoices,
        coalesce(sum(total) filter (where kind = 'CREDIT_NOTE'), 0) as credited,
        coalesce(sum(tax) filter (where kind = 'CREDIT_NOTE'), 0) as credited_tax,
        count(*) filter (where kind = 'CREDIT_NOTE') as credit_notes,
        coalesce(sum(total) filter (where kind = 'INVOICE' and subscription_id is not null), 0) as plan_sales
      from invoices where status <> 'VOID' and issue_date between ${from} and ${to}`),
  );
  const [money] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select
        coalesce(sum(amount) filter (where type = 'PAYMENT'), 0) as received,
        coalesce(sum(amount) filter (where type = 'REFUND'), 0) as refunded,
        count(*) filter (where type = 'PAYMENT') as payments
      from payments where status = 'RECEIVED' and paid_at between ${dayStart(from)}::timestamptz and ${dayEnd(to)}::timestamptz`),
  );
  const byMethod = rowsOf<{ method: string; total: unknown }>(
    await db.execute(sql`
      select method, sum(case when type = 'REFUND' then -amount else amount end) as total
      from payments where status = 'RECEIVED' and paid_at between ${dayStart(from)}::timestamptz and ${dayEnd(to)}::timestamptz
      group by method order by 2 desc`),
  ).map((r) => ({ method: r.method, total: n(r.total) }));
  const expenseRows = rowsOf<{ name: string | null; total: unknown; count: unknown }>(
    await db.execute(sql`
      select c.name, sum(e.amount) as total, count(*) as count
      from expenses e left join expense_categories c on c.id = e.category_id
      where e.deleted_at is null and e.date between ${from} and ${to}
      group by c.name order by 2 desc`),
  ).map((r) => ({ name: r.name ?? "Uncategorised", total: n(r.total), count: n(r.count) }));
  const expensesTotal = expenseRows.reduce((t, r) => t + r.total, 0);

  // Daily series: collections (net of refunds) and expenses.
  const daily = rowsOf<{ d: string; collected: unknown; spent: unknown }>(
    await db.execute(sql`
      with days as (select to_char(g, 'YYYY-MM-DD') as d from generate_series(${from}::date, ${to}::date, interval '1 day') g)
      select days.d,
        coalesce((select sum(case when p.type = 'REFUND' then -p.amount else p.amount end) from payments p
          where p.status = 'RECEIVED' and to_char(p.paid_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') = days.d), 0) as collected,
        coalesce((select sum(e.amount) from expenses e where e.deleted_at is null and e.date = days.d), 0) as spent
      from days order by days.d`),
  ).map((r) => ({ date: r.d, collected: n(r.collected), spent: n(r.spent) }));

  // As of now (not limited to the range).
  const [owed] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select coalesce(sum(greatest(due, 0)), 0) as outstanding, count(*) filter (where due > 0) as count from (
        select i.total
          - coalesce((select sum(c.total) from invoices c where c.related_invoice_id = i.id and c.kind = 'CREDIT_NOTE'), 0)
          - coalesce((select sum(case when p.type = 'REFUND' then -p.amount else p.amount end) from payments p where p.invoice_id = i.id and p.status = 'RECEIVED'), 0) as due
        from invoices i where i.kind = 'INVOICE' and i.status in ('ISSUED', 'PARTIALLY_PAID')) x`),
  );
  const today = istParts().dateStr;
  const [adv] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select coalesce(sum(least(paid, s.total) * remaining::numeric / greatest(s.days_total + s.extra_authorized, 1)), 0) as advances,
        coalesce(sum(remaining), 0) as days_owed
      from subscriptions s
      join lateral (select coalesce(sum(case when p.type = 'REFUND' then -p.amount else p.amount end), 0) as paid
        from payments p where p.subscription_id = s.id and p.status = 'RECEIVED') pay on true
      join lateral (select count(*) as remaining from subscription_days d left join orders o on o.id = d.order_id
        where d.subscription_id = s.id and (d.status = 'HELD' or (d.status = 'SCHEDULED' and d.date >= ${today} and coalesce(o.status, '') not in ('DELIVERED', 'CANCELLED')))) rem on true
      where s.status in ('ACTIVE', 'PAUSED')`),
  );
  const [subs] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select
        count(*) filter (where status = 'ACTIVE') as active,
        count(*) filter (where status = 'PAUSED') as paused,
        count(*) filter (where status = 'PENDING_PAYMENT') as waiting,
        count(*) filter (where created_at between ${dayStart(from)}::timestamptz and ${dayEnd(to)}::timestamptz and status <> 'CANCELLED') as started,
        count(*) filter (where status = 'COMPLETED' and actual_end_date between ${from} and ${to}) as completed,
        count(*) filter (where renewed_from_id is not null and created_at between ${dayStart(from)}::timestamptz and ${dayEnd(to)}::timestamptz) as renewed,
        count(*) filter (where status = 'CANCELLED' and updated_at between ${dayStart(from)}::timestamptz and ${dayEnd(to)}::timestamptz) as cancelled,
        count(distinct customer_id) filter (where status in ('ACTIVE', 'PAUSED')) as subscribers
      from subscriptions`),
  );

  const invoiced = n(sales.invoiced);
  const credited = n(sales.credited);
  const netSales = invoiced - credited;
  const netSalesExTax = invoiced - n(sales.invoiced_tax) - (credited - n(sales.credited_tax));
  const received = n(money.received);
  const refunded = n(money.refunded);
  const completed = n(subs.completed);
  return {
    sales: { invoiced, credited, net: netSales, exTax: netSalesExTax, tax: n(sales.invoiced_tax) - n(sales.credited_tax), invoices: n(sales.invoices), creditNotes: n(sales.credit_notes), plans: n(sales.plan_sales) },
    collections: { received, refunded, net: received - refunded, payments: n(money.payments), byMethod },
    expenses: { total: expensesTotal, byCategory: expenseRows },
    profit: netSalesExTax - expensesTotal,
    cashFlow: received - refunded - expensesTotal,
    outstanding: { amount: n(owed.outstanding), invoices: n(owed.count) },
    advances: { amount: Math.round(n(adv.advances)), daysOwed: n(adv.days_owed) },
    subscribers: {
      active: n(subs.active),
      paused: n(subs.paused),
      waiting: n(subs.waiting),
      started: n(subs.started),
      completed,
      renewed: n(subs.renewed),
      cancelled: n(subs.cancelled),
      customers: n(subs.subscribers),
      renewalRate: completed ? Math.round((n(subs.renewed) / completed) * 100) : null,
    },
    daily,
  };
}
export type FinanceSummary = Awaited<ReturnType<typeof financeSummary>>;
