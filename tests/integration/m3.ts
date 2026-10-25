/** M3 billing: invoices, receipts, credit notes, GST, PDFs. Run: npm run test:integration */
import { and, eq, ne } from "drizzle-orm";
import { db, deliverySlots, invoices, orders, payments, storeSettings, users } from "../../src/db";
import { createCustomer, BizError } from "../../src/lib/biz/customers";
import { createAdminSubscription, subscriptionSummary } from "../../src/lib/biz/subscriptions";
import { recordPayment, recordRefund } from "../../src/lib/biz/payments";
import { financialYear, getInvoice, getInvoiceByToken, invoiceMoney, issueMissingInvoices, liveInvoice, reissue, syncBilling, taxSplit, voidInvoice } from "../../src/lib/biz/invoices";
import { invoicePdf, receiptPdf } from "../../src/lib/biz/invoice-pdf";
import { receiptContext } from "../../src/lib/biz/receipt-context";
import { addDays, dayOfWeek, istParts } from "../../src/lib/time";

let fails = 0;
const check = (l: string, c: boolean, x: unknown = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`, c ? "" : JSON.stringify(x)); if (!c) fails++; };
const T = Date.now();
const utr = (n: number) => String(T + n).slice(-12).padStart(12, "7");
const nextWeekday = (from: string) => { let d = from; while ([0, 6].includes(dayOfWeek(d))) d = addDays(d, 1); return d; };

(async () => {
  check("financial year", financialYear("2026-10-25") === "26-27" && financialYear("2027-03-31") === "26-27" && financialYear("2027-04-01") === "27-28");
  const [admin] = await db.select().from(users).where(eq(users.role, "ADMIN"));
  const actor = { id: admin.id, name: "Owner" };
  const [slot] = await db.select().from(deliverySlots);
  await db.update(storeSettings).set({ gstRegistered: false, gstin: "", invoicePrefix: "SS" }).where(eq(storeSettings.id, 1));
  const fy = financialYear(istParts().dateStr);

  const cust = await createCustomer({ name: "Meena Billing", phone: "7" + String(T).slice(-9), email: "meena@test.in", address: { house: "9", area: "Thoraipakkam", pincode: "600097" } }, actor);
  const start = nextWeekday(addDays(istParts().dateStr, 2));

  // 1. Admin plan, nothing paid → invoice issued straight away, not paid
  const sub = await createAdminSubscription({ idempotencyKey: "m3a-" + T, customerId: cust.id, planCode: "WEEKLY", slotId: slot.id, weekdays: [1, 2, 3, 4, 5], sequence: [], startDate: start }, actor);
  let inv = (await liveInvoice({ subscriptionId: sub.id }))!;
  check("admin plan → invoice issued", !!inv && inv.status === "ISSUED" && inv.total === sub.total, inv);
  check("invoice number SS/FY/NNNN", new RegExp(`^SS/${fy}/\\d{4}$`).test(inv.number), inv.number);
  check("snapshot has customer + business", inv.customer.name === "Meena Billing" && !!inv.business.name && inv.customer.address.includes("600097"));
  check("no GST invoice while not registered", !inv.gstInvoice && taxSplit(inv).length === 0);

  // 2. Part payment → part paid, payment linked to the invoice
  const half = Math.round(sub.total / 2);
  const p1 = await recordPayment({ customerId: cust.id, subscriptionId: sub.id, amount: half, method: "UPI", reference: utr(1), status: "RECEIVED" }, actor);
  inv = (await getInvoice(inv.id))!.inv;
  const [p1row] = await db.select().from(payments).where(eq(payments.id, p1.id));
  check("part payment → part paid and linked", inv.status === "PARTIALLY_PAID" && p1row.invoiceId === inv.id, [inv.status, p1row.invoiceId]);
  let m = await invoiceMoney(inv);
  check("balance due = total − paid", m.due === sub.total - half, m.due);

  // Can't cancel once money is in
  await voidInvoice(inv.id, "test", actor).then(() => check("void refused after payment", false)).catch((e) => check("void refused after payment", e instanceof BizError));

  // 3. Rest paid → paid, plan active
  await recordPayment({ customerId: cust.id, subscriptionId: sub.id, amount: sub.total - half, method: "CASH", status: "RECEIVED" }, actor);
  inv = (await getInvoice(inv.id))!.inv;
  const s1 = (await subscriptionSummary(sub.id))!;
  check("fully paid → invoice paid, plan active", inv.status === "PAID" && s1.sub.status === "ACTIVE", [inv.status, s1.sub.status]);
  const again = await syncBilling({ subscriptionId: sub.id }, actor);
  const allForSub = await db.select().from(invoices).where(and(eq(invoices.subscriptionId, sub.id), eq(invoices.kind, "INVOICE")));
  check("sync is idempotent (one invoice per plan)", again!.id === inv.id && allForSub.length === 1);

  // 4. Refund → credit note, invoice settled
  await recordRefund({ customerId: cust.id, subscriptionId: sub.id, amount: 10000, method: "UPI", reason: "One day not delivered" }, actor);
  const found = (await getInvoice(inv.id))!;
  const cn = found.money.creditNotes[0];
  check("refund → credit note CN/FY/NNNN for ₹100", !!cn && new RegExp(`^CN/${fy}/\\d{4}$`).test(cn.number) && cn.total === 10000 && cn.relatedInvoiceId === inv.id, cn);
  check("credit note keeps tax share", cn.tax === Math.round((10000 * inv.tax) / inv.total) && cn.subtotal + cn.tax === 10000);
  check("after refund + credit note nothing is due", found.money.due === 0 && found.inv.status === "PAID", [found.money.due, found.inv.status]);

  // 5. Unpaid plan: cancel invoice, re-issue gets a new number
  const sub2 = await createAdminSubscription({ idempotencyKey: "m3b-" + T, customerId: cust.id, planCode: "TRIAL", slotId: slot.id, weekdays: [1, 2, 3, 4, 5], sequence: [], startDate: addDays(s1.sub.endDate, 7), allowOverlap: true }, actor);
  const inv2 = (await liveInvoice({ subscriptionId: sub2.id }))!;
  await voidInvoice(inv2.id, "Wrong plan", actor);
  const voided = (await getInvoice(inv2.id))!.inv;
  check("unpaid invoice can be cancelled (kept, marked void)", voided.status === "VOID" && voided.voidReason === "Wrong plan");
  const inv3 = await reissue({ subscriptionId: sub2.id }, actor);
  check("re-issue → new number, old one not reused", inv3.id !== inv2.id && inv3.number !== inv2.number && inv3.status === "ISSUED");

  // 6. GST registered → tax invoice with CGST/SGST
  await db.update(storeSettings).set({ gstRegistered: true, gstin: "33ABCDE1234F1Z5", businessState: "Tamil Nadu" }).where(eq(storeSettings.id, 1));
  const sub3 = await createAdminSubscription({ idempotencyKey: "m3c-" + T, customerId: cust.id, planCode: "TRIAL", slotId: slot.id, weekdays: [1, 2, 3, 4, 5], sequence: [], startDate: addDays(s1.sub.endDate, 21), allowOverlap: true }, actor);
  const inv4 = (await liveInvoice({ subscriptionId: sub3.id }))!;
  const split = taxSplit(inv4);
  check("GST on → tax invoice with GSTIN", inv4.gstInvoice && inv4.business.gstin === "33ABCDE1234F1Z5");
  check("same state → CGST + SGST adding up", inv4.tax === 0 || (split.length === 2 && split[0].amount + split[1].amount === inv4.tax && /CGST/.test(split[0].label)), split);
  const igst = taxSplit({ ...inv4, tax: 1000, taxPercent: 5, customer: { ...inv4.customer, state: "Karnataka" } });
  check("other state → IGST", igst.length === 1 && /IGST 5%/.test(igst[0].label) && igst[0].amount === 1000, igst);
  await db.update(storeSettings).set({ gstRegistered: false, gstin: "" }).where(eq(storeSettings.id, 1));
  check("old invoices unchanged after settings change", !(await getInvoice(inv.id))!.inv.gstInvoice);

  // 7. Website plan: invoice only once money arrives
  const { buyPlan } = await import("../../src/lib/plans");
  const { submitUpiPayment, confirmUpiPayment } = await import("../../src/lib/orders");
  const [std] = (await (await import("../../src/lib/menu")).getMenu()).items.filter((p) => p.planTier === "STANDARD");
  const wp = await buyPlan({ idempotencyKey: "m3w-" + T, planCode: "TRIAL", slotId: slot.id, bowls: {}, sequence: Array(3).fill(std.id), quantity: 1, large: false, addressByWeekday: {},
    contact: { name: "Web Invoice", phone: "6" + String(T).slice(-9), email: "webinv@test.in" }, address: { house: "2", building: "", street: "", area: "Taramani", city: "Chennai", state: "Tamil Nadu", pincode: "600113", landmark: "", instructions: "" },
    addressLabel: "", address2: null, address2Label: "", notes: "", acceptedPolicy: true }, admin.id);
  const [wo] = await db.select().from(orders).where(eq(orders.id, wp.orderId));
  check("website plan: no invoice before payment", !(await liveInvoice({ subscriptionId: wo.subscriptionId! })));
  await submitUpiPayment(wo.id, wo.trackingToken, utr(5));
  const claimInv = await liveInvoice({ subscriptionId: wo.subscriptionId! });
  check("customer's unchecked UPI claim → still no invoice", !claimInv, claimInv?.status);
  await confirmUpiPayment(wo.id, actor);
  const paidInv = (await liveInvoice({ subscriptionId: wo.subscriptionId! }))!;
  check("owner confirms → invoice paid", paidInv.status === "PAID" && paidInv.total === wo.total, [paidInv.status, paidInv.total, wo.total]);

  // 8. Public link + PDFs
  const pub = await getInvoiceByToken(paidInv.publicToken);
  check("private link finds the invoice; junk token doesn't", pub?.inv.id === paidInv.id && !(await getInvoiceByToken("not-a-real-token-123456")));
  const pdf = Buffer.from(await invoicePdf(found.inv, found.money.payments));
  check("invoice PDF renders", pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 1500, pdf.length);
  const cnPdf = Buffer.from(await invoicePdf(cn, [], found.inv));
  check("credit note PDF renders", cnPdf.subarray(0, 5).toString() === "%PDF-");
  const rc = (await receiptContext(p1.id))!;
  const rpdf = Buffer.from(await receiptPdf(rc.p, rc.ctx));
  check("receipt PDF renders with invoice number", rpdf.subarray(0, 5).toString() === "%PDF-" && rc.ctx.invoiceNumber === inv.number);

  // 9. Catch-up job doesn't duplicate
  await issueMissingInvoices(actor);
  const r2 = await issueMissingInvoices(actor);
  const dupes = await db.execute<{ n: number }>(
    (await import("drizzle-orm")).sql`select count(*)::int n from (select subscription_id from invoices where kind='INVOICE' and status<>'VOID' and subscription_id is not null group by subscription_id having count(*)>1) x`,
  );
  const n = ("rows" in dupes ? (dupes as { rows: { n: number }[] }).rows : (dupes as unknown as { n: number }[]))[0].n;
  check("catch-up job: nothing left to issue, no duplicates", r2.plans === 0 && r2.orders === 0 && r2.creditNotes === 0 && n === 0, [r2, n]);
  const paidOrder = await db.select().from(orders).where(and(eq(orders.kind, "ORDER"), eq(orders.paymentStatus, "PAID"), ne(orders.total, 0))).limit(1);
  if (paidOrder.length) check("paid one-off orders have invoices", !!(await liveInvoice({ orderId: paidOrder[0].id })));

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
