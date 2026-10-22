import { eq } from "drizzle-orm";
import { db, deliverySlots, orders, payments, storeSettings, subscriptions, users, products } from "../../src/db";
import { createCustomer, BizError, listCustomers } from "../../src/lib/biz/customers";
import { createAdminSubscription, startBeforePayment, subscriptionSummary } from "../../src/lib/biz/subscriptions";
import { recordPayment, reversePayment, recordRefund, subscriptionMoney } from "../../src/lib/biz/payments";
import { buyPlan } from "../../src/lib/plans";
import { submitUpiPayment, confirmUpiPayment } from "../../src/lib/orders";
import { dayOfWeek } from "../../src/lib/time";

let fails = 0;
const check = (l: string, c: boolean, x: unknown = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`, c ? "" : x); if (!c) fails++; };
const T = Date.now();
const utr = (n: number) => String(T + n).slice(-12).padStart(12, "4");
(async () => {
  await db.update(storeSettings).set({ upiId: "test@okaxis", paymentMode: "UPI" }).where(eq(storeSettings.id, 1));
  const [admin] = await db.select().from(users).where(eq(users.role, "ADMIN"));
  const actor = { id: admin.id, name: "Owner" };
  const [slot] = await db.select().from(deliverySlots);
  await db.update(products).set({ planTier: "PREMIUM" }).where(eq(products.slug, "high-protein-paneer-bowl"));
  const prods = await db.select().from(products);
  const premium = prods.find((p) => p.planTier === "PREMIUM")!;
  const standard = prods.find((p) => p.planTier === "STANDARD")!;

  const phone = "9" + String(T).slice(-9);
  const cust = await createCustomer({ name: "Priya Test", phone, address: { house: "4B", area: "Perungudi", pincode: "600096" }, foodPreferences: "No onion" }, actor);
  check("customer code generated", /^CUST-\d{4}$/.test(cust.code), cust.code);
  await createCustomer({ name: "Dup", phone }, actor).then(() => check("duplicate phone refused", false)).catch((e) => check("duplicate phone refused", e instanceof BizError));

  // 1. Trial, paid now → active, 3 weekday deliveries
  const trial = await createAdminSubscription({ allowOverlap: true, idempotencyKey: "t-" + T, customerId: cust.id, planCode: "TRIAL", slotId: slot.id, weekdays: [1, 2, 3, 4, 5], sequence: [], payment: { amount: 52395, method: "UPI", reference: utr(1), status: "RECEIVED", note: "" } }, actor);
  let s = (await subscriptionSummary(trial.id))!;
  check("trial active after payment", s.sub.status === "ACTIVE", s.sub.status);
  check("trial: 3 weekday kitchen orders", s.sub.days.length === 3 && s.sub.days.every((d) => d.order && ![0, 6].includes(dayOfWeek(d.date))));
  check("trial paid", s.money.status === "PAID" && s.money.due === 0, s.money);
  check("trial is 3 entitled, 3 remaining", s.stats.entitled === 3 && s.stats.remaining === 3, s.stats);
  const [rcpt] = await db.select().from(payments).where(eq(payments.subscriptionId, trial.id));
  check("receipt number", /^RCPT-\d{4}$/.test(rcpt.receiptNo), rcpt.receiptNo);
  const [po] = await db.select().from(orders).where(eq(orders.id, s.sub.paymentOrderId!));
  check("payment order marked paid, no duplicate ledger", po.paymentStatus === "PAID" && (await db.select().from(payments).where(eq(payments.orderId, po.id))).length === 1);

  // Same plan submit twice → same plan
  const again = await createAdminSubscription({ allowOverlap: true, idempotencyKey: "t-" + T, customerId: cust.id, planCode: "TRIAL", slotId: slot.id, weekdays: [1, 2, 3, 4, 5], sequence: [] }, actor);
  check("double submit → same plan", again.id === trial.id);

  // 2. Weekly with premium days, partial payment → pending until fully paid
  const seq = [premium.id, standard.id, premium.id, standard.id, standard.id];
  const weekly = await createAdminSubscription({ allowOverlap: true, idempotencyKey: "w-" + T, customerId: cust.id, planCode: "WEEKLY", slotId: slot.id, weekdays: [1, 2, 3, 4, 5], sequence: seq, payment: { amount: 50000, method: "CASH", status: "RECEIVED", note: "" } }, actor);
  s = (await subscriptionSummary(weekly.id))!;
  check("weekly price = 849 + 2×30 premium (+tax)", s.sub.subtotal === 84900 + 6000, s.sub.subtotal);
  check("partly paid → not started", s.sub.status === "PENDING_PAYMENT" && s.money.status === "PARTIALLY_PAID", [s.sub.status, s.money.status]);
  check("no kitchen orders before payment", s.sub.days.every((d) => !d.orderId));
  await recordPayment({ customerId: cust.id, subscriptionId: weekly.id, amount: s.money.due, method: "UPI", reference: utr(1), status: "RECEIVED" }, actor)
    .then(() => check("duplicate UTR refused", false)).catch((e) => check("duplicate UTR refused", e instanceof BizError && /already recorded/.test(e.message), e.message));
  await recordPayment({ customerId: cust.id, subscriptionId: weekly.id, amount: s.money.due, method: "UPI", reference: utr(2), status: "PENDING_VERIFICATION" }, actor);
  s = (await subscriptionSummary(weekly.id))!;
  check("to-verify money doesn't start the plan", s.sub.status === "PENDING_PAYMENT" && s.money.toVerify > 0);
  const toVerify = s.money.rows.find((r) => r.status === "PENDING_VERIFICATION")!;
  const { verifyPayment } = await import("../../src/lib/biz/payments");
  await verifyPayment(toVerify.id, actor);
  s = (await subscriptionSummary(weekly.id))!;
  check("verified → paid & active with 5 days", s.sub.status === "ACTIVE" && s.money.status === "PAID" && s.sub.days.filter((d) => d.orderId).length === 5);
  check("premium days kept their tier", s.sub.days.filter((d) => d.tier === "PREMIUM").length === 2);

  // 3. Monthly 22 on Mon–Sat → skips Sundays only
  const monthly = await createAdminSubscription({ allowOverlap: true, idempotencyKey: "m-" + T, customerId: cust.id, planCode: "MONTHLY", slotId: slot.id, weekdays: [1, 2, 3, 4, 5, 6], sequence: [], startEarlyReason: "Regular customer, pays Friday" }, actor);
  s = (await subscriptionSummary(monthly.id))!;
  check("monthly: 22 deliveries, no Sundays", s.sub.days.length === 22 && s.sub.days.every((d) => dayOfWeek(d.date) !== 0), s.sub.days.length);
  check("monthly includes Saturdays", s.sub.days.some((d) => dayOfWeek(d.date) === 6));
  check("started early with reason, still due", s.sub.status === "ACTIVE" && s.money.status === "PENDING" && s.sub.activationNote.includes("Regular customer"), [s.sub.status, s.money.status]);
  await startBeforePayment(monthly.id, "again", actor).then(() => check("can't start twice", false)).catch(() => check("can't start twice", true));

  // 4. Reverse a mistaken payment; refund
  const cash = await recordPayment({ customerId: cust.id, subscriptionId: monthly.id, amount: 100000, method: "CASH", status: "RECEIVED", note: "first half" }, actor);
  await reversePayment(cash.id, "Typed wrong amount", actor);
  const m = await subscriptionMoney((await db.select().from(subscriptions).where(eq(subscriptions.id, monthly.id)))[0]);
  check("reversed payment doesn't count", m.net === 0 && m.rows.some((r) => r.status === "REVERSED"));
  await recordRefund({ customerId: cust.id, subscriptionId: trial.id, amount: 60000, method: "UPI", reason: "too much" }, actor).then(() => check("refund capped at received", false)).catch(() => check("refund capped at received", true));
  await recordRefund({ customerId: cust.id, subscriptionId: trial.id, amount: 10000, method: "UPI", reason: "Missed delivery" }, actor);
  const tm = await subscriptionMoney((await db.select().from(subscriptions).where(eq(subscriptions.id, trial.id)))[0]);
  check("refund reduces net", tm.refunded === 10000 && tm.net === 42395, tm);

  // 5. Website plan → ledger + customer link
  const KEY = "web-" + T;
  const pay = await buyPlan({ idempotencyKey: KEY, planCode: "WEEKLY", slotId: slot.id, bowls: {}, sequence: Array(5).fill(standard.id), quantity: 1, large: false, addressByWeekday: {},
    contact: { name: "Web Buyer", phone: "8" + String(T).slice(-9), email: "web@test.in" }, address: { house: "1", building: "", street: "", area: "Taramani", city: "Chennai", state: "Tamil Nadu", pincode: "600113", landmark: "", instructions: "" },
    addressLabel: "", address2: null, address2Label: "", notes: "", acceptedPolicy: true }, admin.id);
  const [wpo] = await db.select().from(orders).where(eq(orders.id, pay.orderId));
  check("website order linked to a customer", !!wpo.customerId);
  await submitUpiPayment(wpo.id, wpo.trackingToken, utr(9));
  let wl = await db.select().from(payments).where(eq(payments.orderId, wpo.id));
  check("UTR → ledger 'to verify'", wl.length === 1 && wl[0].status === "PENDING_VERIFICATION");
  await confirmUpiPayment(wpo.id, actor);
  wl = await db.select().from(payments).where(eq(payments.orderId, wpo.id));
  const [wsub] = await db.select().from(subscriptions).where(eq(subscriptions.id, wpo.subscriptionId!));
  check("owner confirm → received, plan active, one ledger row", wl.length === 1 && wl[0].status === "RECEIVED" && wl[0].verifiedBy === "Owner" && wsub.status === "ACTIVE");
  const list = await listCustomers({ q: "Priya" });
  check("customer search + status", list.some((c) => c.id === cust.id && c.status === "ACTIVE" && c.balance > 0), list.map((c) => [c.name, c.status, c.balance]));
  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
