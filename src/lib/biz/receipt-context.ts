import "server-only";
import { eq } from "drizzle-orm";
import { customers, db, invoices, orders, payments, storeSettings, subscriptions } from "@/db";

/** Who/what a receipt is for, for the receipt PDF. */
export async function receiptContext(paymentId: string) {
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p) return null;
  const [s] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  const [inv] = p.invoiceId ? await db.select().from(invoices).where(eq(invoices.id, p.invoiceId)) : [];
  const [c] = p.customerId ? await db.select().from(customers).where(eq(customers.id, p.customerId)) : [];
  const [sub] = p.subscriptionId ? await db.select().from(subscriptions).where(eq(subscriptions.id, p.subscriptionId)) : [];
  const [o] = !sub && p.orderId ? await db.select().from(orders).where(eq(orders.id, p.orderId)) : [];
  return {
    p,
    inv: inv ?? null,
    ctx: {
      business: { name: s.legalName || s.businessName, address: s.address, phone: s.phone, gstin: s.gstRegistered ? s.gstin : "" },
      customerName: c?.name ?? inv?.customer.name ?? sub?.customerName ?? o?.customerName ?? "Customer",
      invoiceNumber: inv?.number ?? null,
      forWhat: sub ? `${sub.planName} meal plan ${sub.number}` : o ? `Order ${o.orderNumber}` : "Salad Stories",
    },
  };
}
