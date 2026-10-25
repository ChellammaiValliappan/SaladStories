/**
 * Acceptance scenarios for the Subscription, Order & Billing module — one story per requirement.
 * Runs against the local database (npm run test:acceptance). Role checks over HTTP are in roles.ts.
 */
import { and, eq, sql } from "drizzle-orm";
import { auditLogs, db, deliverySlots, invoices, jobRuns, notifications, orders, storeSettings, subscriptionDays, subscriptions, users } from "../../src/db";
import { BizError, createCustomer, listCustomers } from "../../src/lib/biz/customers";
import { createAdminSubscription, startBeforePayment, subscriptionSummary } from "../../src/lib/biz/subscriptions";
import { recordPayment, recordRefund, verifyPayment } from "../../src/lib/biz/payments";
import { decideRequest, pausePlan, requestSkip, resumePlan } from "../../src/lib/biz/requests";
import { deliveryList, formatDeliveryList } from "../../src/lib/biz/daily";
import { completeFinishedPlans, runJob, sendRenewalReminders, sendTomorrowList, tick } from "../../src/lib/biz/jobs";
import { getInvoice, liveInvoice } from "../../src/lib/biz/invoices";
import { invoicePdf } from "../../src/lib/biz/invoice-pdf";
import { createExpense, listCategories } from "../../src/lib/biz/expenses";
import { financeSummary } from "../../src/lib/biz/finance";
import { exportSheets, toXlsx } from "../../src/lib/biz/exports";
import { canChangeDay } from "../../src/lib/plans-core";
import { addDays, dayOfWeek, istParts } from "../../src/lib/time";

let fails = 0;
let section = "";
const check = (l: string, c: boolean, x: unknown = "") => { console.log(`${c ? "PASS" : "FAIL"}  [${section}] ${l}`, c ? "" : JSON.stringify(x)); if (!c) fails++; };
const T = Date.now();
const utr = (n: number) => String(T + n).slice(-12).padStart(12, "3");
const nextWeekday = (from: string, days = [1, 2, 3, 4, 5]) => { let d = from; while (!days.includes(dayOfWeek(d))) d = addDays(d, 1); return d; };

(async () => {
  const [admin] = await db.select().from(users).where(eq(users.role, "ADMIN"));
  const owner = { id: admin.id, name: "Owner" };
  // Test runs pile up orders in the local database; don't let slot capacity change the dates.
  await db.update(deliverySlots).set({ maxOrders: 100000 });
  const [slot] = await db.select().from(deliverySlots);
  const today = istParts().dateStr;
  await db.update(storeSettings).set({ gstRegistered: false, gstin: "" }).where(eq(storeSettings.id, 1));

  // 1 ─ Customer management
  section = "1 customers";
  const phone = "9" + String(T).slice(-9);
  const c = await createCustomer({ name: "Anitha Acceptance", phone, email: "anitha@test.in", address: { house: "7", area: "Perungudi", pincode: "600096" }, foodPreferences: "No onion" }, owner);
  check("customer gets a code", /^CUST-\d{4}$/.test(c.code));
  await createCustomer({ name: "Copy", phone: `+91 ${phone}` }, owner).then(() => check("same phone refused", false)).catch((e) => check("same phone refused (any format)", e instanceof BizError));
  check("search by phone finds them", (await listCustomers({ q: phone.slice(-4) })).some((x) => x.id === c.id));

  // 2 ─ Plans: fixed price, Trial/Weekly/Monthly delivery days, per-customer weekdays
  section = "2 plans";
  const start = nextWeekday(addDays(today, 3), [1, 3, 5]);
  const monthly = await createAdminSubscription({ idempotencyKey: "acc-m-" + T, customerId: c.id, planCode: "MONTHLY", slotId: slot.id, weekdays: [1, 3, 5], sequence: [], startDate: start }, owner);
  let s = (await subscriptionSummary(monthly.id))!;
  check("Monthly = 22 delivery days", s.sub.daysTotal === 22 && s.sub.days.length === 22);
  check("only the customer's weekdays (Mon/Wed/Fri)", s.sub.days.every((d) => [1, 3, 5].includes(dayOfWeek(d.date))));
  check("price is the plan's fixed price (+ tax)", s.sub.subtotal >= 349900, s.sub.subtotal);

  // 3 ─ Activation only on payment; partial payments tracked
  section = "3 payments";
  check("not active before payment, nothing on the kitchen sheet", s.sub.status === "PENDING_PAYMENT" && s.sub.days.every((d) => !d.orderId));
  await recordPayment({ customerId: c.id, subscriptionId: monthly.id, amount: 100000, method: "CASH", status: "RECEIVED" }, owner);
  s = (await subscriptionSummary(monthly.id))!;
  check("part payment → still waiting, balance shown", s.sub.status === "PENDING_PAYMENT" && s.money.status === "PARTIALLY_PAID" && s.money.due === s.sub.total - 100000);
  const pend = await recordPayment({ customerId: c.id, subscriptionId: monthly.id, amount: s.money.due, method: "UPI", reference: utr(1), status: "PENDING_VERIFICATION" }, owner);
  check("unverified UPI doesn't start the plan", (await subscriptionSummary(monthly.id))!.sub.status === "PENDING_PAYMENT");
  await recordPayment({ customerId: c.id, subscriptionId: monthly.id, amount: 100, method: "UPI", reference: utr(1), status: "RECEIVED" }, owner)
    .then(() => check("same UTR can't be recorded twice", false)).catch((e) => check("same UTR can't be recorded twice", e instanceof BizError));
  await verifyPayment(pend.id, owner);
  s = (await subscriptionSummary(monthly.id))!;
  check("fully paid → active, 22 kitchen orders", s.sub.status === "ACTIVE" && s.money.status === "PAID" && s.sub.days.filter((d) => d.orderId).length === 22);

  // 4 ─ Delivery counting
  section = "4 counting";
  const days = s.sub.days.filter((d) => d.status === "SCHEDULED").sort((a, b) => a.date.localeCompare(b.date));
  check("Day N of M", s.dayNumberOf(days[0].date) === 1 && s.dayNumberOf(days[21].date) === 22);
  check("remaining = 22 before any delivery", s.stats.remaining === 22 && s.stats.entitled === 22);

  // 5 ─ 8 pm tomorrow's orders list + separate attention alert, sent once
  section = "5 daily list";
  const listDate = days[0].date;
  const trial = await createAdminSubscription({ idempotencyKey: "acc-t-" + T, customerId: c.id, planCode: "TRIAL", slotId: slot.id, weekdays: [1, 2, 3, 4, 5], sequence: [], startDate: listDate, allowOverlap: true, startEarlyReason: "Regular customer, pays Friday" }, owner);
  const text = formatDeliveryList(listDate, await deliveryList(listDate));
  check("list shows customer, plan, day N of M, payment", text.includes("Anitha Acceptance") && /Delivery: Day 1 of 22/.test(text) && /Payment: Paid/.test(text) && /Payment: Pending/.test(text), text.slice(0, 500));
  await db.delete(jobRuns).where(eq(jobRuns.runKey, `daily-orders:${listDate}`));
  await db.delete(notifications).where(sql`${notifications.dedupeKey} in (${`daily-orders:${listDate}`}, ${`attention:${listDate}`})`);
  const r1 = await runJob(`daily-orders:${listDate}`, "daily-orders", () => sendTomorrowList(listDate));
  const r2 = await runJob(`daily-orders:${listDate}`, "daily-orders", () => sendTomorrowList(listDate));
  const att = await db.select().from(notifications).where(and(eq(notifications.dedupeKey, `attention:${listDate}`), eq(notifications.channel, "IN_APP")));
  check("sent once, second run skipped", r1.ran && !r1.error && !r2.ran);
  check("separate attention alert names the unpaid plan", att.length === 1 && att[0].body.includes("Anitha Acceptance") && /pending|partially paid/i.test(att[0].body), att[0]?.body);

  // 6 ─ Skip: owner decides; end date and counts stay correct; audited
  section = "6 skips";
  const skipDay = days[2];
  check("customer 24-hour cut-off rule", canChangeDay(addDays(today, 3), "12:30") && !canChangeDay(today, "12:30"));
  const req = await requestSkip({ subscriptionId: monthly.id, dayId: skipDay.id, reason: "Out of town" }, { actor: { id: "x", name: "Anitha" }, customer: true, userId: s.sub.userId });
  check("request holds the day off the kitchen sheet", !(await deliveryList(skipDay.date)).some((e) => e.plan?.subscriptionId === monthly.id));
  const endBefore = (await subscriptionSummary(monthly.id))!.sub.endDate;
  await decideRequest(req.id, { outcome: "CARRIED_FORWARD", note: "ok" }, owner);
  s = (await subscriptionSummary(monthly.id))!;
  check("carried forward: end date moves, still 22 deliveries", s.sub.endDate > endBefore && s.stats.upcoming === 22 && s.stats.unscheduled === 0);
  const req2 = await requestSkip({ subscriptionId: monthly.id, dayId: days[3].id, reason: "Not needed" }, { actor: owner, customer: false });
  await decideRequest(req2.id, { outcome: "FORFEITED", note: "Customer agreed" }, owner);
  s = (await subscriptionSummary(monthly.id))!;
  check("forfeited: counts as used (21 left + 1 forfeited)", s.stats.upcoming === 21 && s.stats.forfeited === 1 && s.stats.remaining === 21);
  const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, req.id));
  check("decision is in the audit log with who and why", logs.some((l) => l.actorName === "Owner" && /^decided/.test(l.action) && l.reason === "ok"));

  // 7 ─ Pause / resume
  section = "7 pause";
  const held = await pausePlan(monthly.id, days[10].date, "Travelling", owner);
  const resumeFrom = nextWeekday(addDays(days[21].date, 7), [1, 3, 5]);
  const back = await resumePlan(monthly.id, resumeFrom, owner);
  s = (await subscriptionSummary(monthly.id))!;
  check("paused days come back from the resume date", back.length === held && back.every((d) => d >= resumeFrom) && s.sub.status === "ACTIVE" && s.stats.upcoming === 21);

  // 8 ─ Renewal reminder + completion
  section = "8 renewal";
  const tr = (await subscriptionSummary(trial.id))!;
  const st = (await db.select().from(storeSettings))[0];
  const rr = await sendRenewalReminders(addDays(tr.sub.endDate, -Math.max(1, st.renewalReminderDays)));
  const [trialNow] = await db.select().from(subscriptions).where(eq(subscriptions.id, trial.id));
  check("reminder before the last delivery, renewal due", rr.reminders >= 1 && trialNow.renewalStatus === "DUE");
  const trialDays = await db.select().from(subscriptionDays).where(eq(subscriptionDays.subscriptionId, trial.id));
  for (const d of trialDays) if (d.orderId) await db.update(orders).set({ status: "DELIVERED" }).where(eq(orders.id, d.orderId));
  await completeFinishedPlans(addDays(tr.sub.endDate, 1));
  const [trialDone] = await db.select().from(subscriptions).where(eq(subscriptions.id, trial.id));
  check("completed after all deliveries; owner told payment is needed", trialDone.status === "COMPLETED" && (await db.select().from(notifications).where(eq(notifications.dedupeKey, `plan-completed:${trial.id}`))).length > 0);
  const renewal = await createAdminSubscription({ idempotencyKey: "acc-r-" + T, customerId: c.id, planCode: "WEEKLY", slotId: slot.id, weekdays: [1, 2, 3, 4, 5], sequence: [], startDate: nextWeekday(addDays(today, 24)), renewedFromId: trial.id, allowOverlap: true }, owner);
  check("renewal is a new plan linked to the old one, waiting for payment", renewal.renewedFromId === trial.id && renewal.status === "PENDING_PAYMENT");

  // 9 ─ Billing
  section = "9 billing";
  const inv = (await liveInvoice({ subscriptionId: monthly.id }))!;
  const m1 = (await getInvoice(inv.id))!;
  check("invoice issued, numbered, paid", /^[A-Z0-9-]+\/\d\d-\d\d\/\d{4}$/.test(inv.number) && m1.inv.status === "PAID" && m1.money.payments.filter((p) => p.status === "RECEIVED").length === 2);
  await recordRefund({ customerId: c.id, subscriptionId: monthly.id, amount: 15000, method: "UPI", reason: "Forfeited day refunded as goodwill" }, owner);
  const m2 = (await getInvoice(inv.id))!;
  check("refund → credit note, invoice settled", m2.money.creditNotes.length === 1 && m2.money.creditNotes[0].total === 15000 && m2.money.due === 0);
  const pdf = Buffer.from(await invoicePdf(m2.inv, m2.money.payments, null, m2.money));
  check("printable PDF", pdf.subarray(0, 5).toString() === "%PDF-");
  const tInv = (await liveInvoice({ subscriptionId: trial.id }))!;
  check("plan started before payment shows as not paid", !!tInv && tInv.status === "ISSUED");

  // 10 ─ GST configurable
  section = "10 GST";
  await db.update(storeSettings).set({ gstRegistered: true, gstin: "33ABCDE1234F1Z5" }).where(eq(storeSettings.id, 1));
  const g = await createAdminSubscription({ idempotencyKey: "acc-g-" + T, customerId: c.id, planCode: "TRIAL", slotId: slot.id, weekdays: [1, 2, 3, 4, 5], sequence: [], startDate: nextWeekday(addDays(today, 27)), allowOverlap: true }, owner);
  const gi = (await liveInvoice({ subscriptionId: g.id }))!;
  await db.update(storeSettings).set({ gstRegistered: false, gstin: "" }).where(eq(storeSettings.id, 1));
  check("GST on → tax invoice with GSTIN; earlier invoices unchanged", gi.gstInvoice && gi.business.gstin === "33ABCDE1234F1Z5" && !(await getInvoice(inv.id))!.inv.gstInvoice);

  // 11 ─ Expenses, finance, exports
  section = "11 finance";
  const before = await financeSummary(today, today);
  const veg = (await listCategories()).find((x) => x.name === "Vegetables")!;
  await createExpense({ date: today, categoryId: veg.id, description: "Acceptance veg", amount: 75000, method: "CASH" }, null, owner);
  const after = await financeSummary(today, today);
  check("expense flows into finance totals", after.expenses.total - before.expenses.total === 75000 && after.cashFlow === after.collections.net - after.expenses.total);
  const book = await toXlsx(await exportSheets("finance", today, today));
  check("Excel export", book.subarray(0, 2).toString() === "PK");

  // 12 ─ Security, roles, audit, time zone
  section = "12 security";
  const other = await createCustomer({ name: "Other Person", phone: "8" + String(T + 7).slice(-9), address: { house: "1", area: "Taramani", pincode: "600113" } }, owner);
  const sNow = (await subscriptionSummary(monthly.id))!;
  const futureDay = sNow.sub.days.filter((d) => d.status === "SCHEDULED").sort((a, b) => b.date.localeCompare(a.date))[0];
  await requestSkip({ subscriptionId: monthly.id, dayId: futureDay.id, reason: "x" }, { actor: { id: "intruder", name: other.name }, customer: true, userId: "someone-else" })
    .then(() => check("a customer can't touch another customer's plan", false)).catch((e) => check("a customer can't touch another customer's plan", e instanceof BizError));
  await startBeforePayment(monthly.id, "x", owner).then(() => check("early start needs a reason / pending plan", false)).catch((e) => check("early start needs a reason / pending plan", e instanceof BizError));
  const trail = await db.select({ n: sql<number>`count(*)::int` }).from(auditLogs).where(sql`${auditLogs.entityId} in (${monthly.id}, ${c.id}, ${inv.id})`);
  check("audit trail exists for customer, plan and invoice", trail[0].n >= 5, trail[0].n);
  check("dates are India time", istParts(new Date("2026-10-25T19:00:00Z")).dateStr === "2026-10-26" && istParts(new Date("2026-10-25T18:00:00Z")).dateStr === "2026-10-25");
  const dupInv = await db.execute(sql`select subscription_id from invoices where kind='INVOICE' and status<>'VOID' and subscription_id is not null group by 1 having count(*)>1`);
  check("never two live invoices for one plan", (("rows" in dupInv ? dupInv.rows : dupInv) as unknown[]).length === 0);

  // Scheduler with a simulated future date (last: it finishes every plan whose days have passed).
  section = "5 daily list";
  const s2 = { dateStr: addDays(today, 900 + (T % 500)), minutes: 20 * 60 + 5, dow: 2 };
  const ta = await tick(s2);
  const tb = await tick({ ...s2, minutes: 20 * 60 + 20 });
  check("scheduler at 8 pm runs once per day (IST)", (ta.dailyOrders as { ran: boolean }).ran && !(tb.dailyOrders as { ran: boolean }).ran);
  const early = await tick({ ...s2, dateStr: addDays(s2.dateStr, 1), minutes: 19 * 60 + 50 });
  check("not before the configured time", !("dailyOrders" in early));

  section = "12 security";
  console.log("(role checks over HTTP: see tests/integration/roles.ts)");
  console.log(fails ? `\n${fails} FAILED` : "\nALL ACCEPTANCE SCENARIOS PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
