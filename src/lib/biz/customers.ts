import "server-only";
import { z } from "zod";
import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { customers, db, orders, payments, subscriptionPlans, subscriptions, type AddressData, type DB } from "@/db";
import { istParts } from "../time";
import { audit, type Actor } from "./audit";
import { code, nextNumber } from "./counters";
import { customerStatus, isMobile, ledgerTotals, normalizePhone, type CustomerStatus } from "./core";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;
export type Customer = typeof customers.$inferSelect;

export class BizError extends Error {}

const addressSchema = z.object({
  house: z.string().trim().max(80).default(""),
  building: z.string().trim().max(120).default(""),
  street: z.string().trim().max(120).default(""),
  area: z.string().trim().max(80).default(""),
  city: z.string().trim().max(60).default("Chennai"),
  state: z.string().trim().max(60).default("Tamil Nadu"),
  pincode: z.string().trim().max(6).default(""),
  landmark: z.string().trim().max(120).default(""),
  instructions: z.string().trim().max(300).default(""),
});

export const customerInput = z.object({
  name: z.string().trim().min(2, "Enter the customer's name").max(80),
  phone: z.string().transform(normalizePhone).refine(isMobile, "Enter a valid 10-digit mobile number"),
  whatsapp: z.string().transform(normalizePhone).refine((v) => v === "" || isMobile(v), "Enter a valid WhatsApp number or leave it blank").default(""),
  email: z.string().trim().toLowerCase().max(120).refine((v) => v === "" || /^\S+@\S+\.\S+$/.test(v), "Enter a valid email or leave it blank").default(""),
  address: addressSchema.optional().nullable(),
  preferredSlotId: z.string().optional().nullable(),
  foodPreferences: z.string().trim().max(300).default(""),
  instructions: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(1000).default(""),
});
export type CustomerInput = z.input<typeof customerInput>;

export async function findCustomerByPhone(phone: string, tx: Tx = db) {
  const [c] = await tx.select().from(customers).where(eq(customers.phone, normalizePhone(phone))).limit(1);
  return c ?? null;
}

async function insertCustomer(tx: Tx, data: z.output<typeof customerInput> & { userId?: string | null }) {
  const n = await nextNumber(tx, "customer");
  const [c] = await tx
    .insert(customers)
    .values({
      code: code("CUST", n),
      name: data.name,
      phone: data.phone,
      whatsapp: data.whatsapp || data.phone,
      email: data.email,
      address: data.address ? (data.address as AddressData) : null,
      preferredSlotId: data.preferredSlotId || null,
      foodPreferences: data.foodPreferences,
      instructions: data.instructions,
      notes: data.notes,
      userId: data.userId ?? null,
    })
    .returning();
  return c;
}

/** Admin: add a customer. Refuses a second customer with the same mobile number. */
export async function createCustomer(input: CustomerInput, actor: Actor) {
  const data = customerInput.parse(input);
  const existing = await findCustomerByPhone(data.phone);
  if (existing) throw new BizError(`${existing.name} (${existing.code}) already has this mobile number.`);
  return db.transaction(async (tx) => {
    const c = await insertCustomer(tx, data);
    await audit(tx, "customer", c.id, "created", { after: c, actor });
    return c;
  });
}

export async function updateCustomer(id: string, input: CustomerInput, actor: Actor) {
  const data = customerInput.parse(input);
  const [before] = await db.select().from(customers).where(eq(customers.id, id));
  if (!before) throw new BizError("Customer not found.");
  const clash = await findCustomerByPhone(data.phone);
  if (clash && clash.id !== id) throw new BizError(`${clash.name} (${clash.code}) already has this mobile number.`);
  return db.transaction(async (tx) => {
    const [after] = await tx
      .update(customers)
      .set({
        name: data.name,
        phone: data.phone,
        whatsapp: data.whatsapp || data.phone,
        email: data.email,
        address: data.address ? (data.address as AddressData) : null,
        preferredSlotId: data.preferredSlotId || null,
        foodPreferences: data.foodPreferences,
        instructions: data.instructions,
        notes: data.notes,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning();
    await audit(tx, "customer", id, "updated", { before, after, actor });
    return after;
  });
}

export async function setCustomerManualStatus(id: string, status: "PAUSED" | "CANCELLED" | null, reason: string, actor: Actor) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ manualStatus: customers.manualStatus }).from(customers).where(eq(customers.id, id));
    await tx.update(customers).set({ manualStatus: status, updatedAt: new Date() }).where(eq(customers.id, id));
    await audit(tx, "customer", id, status ? `marked ${status.toLowerCase()}` : "status override removed", { before, after: { manualStatus: status }, reason, actor });
  });
}

/**
 * Website orders and plans: find the customer by mobile number or create one,
 * keeping the latest contact details. Runs inside the order's transaction.
 */
export async function ensureCustomer(
  tx: Tx,
  d: { name: string; phone: string; email?: string; address?: AddressData | null; userId?: string | null },
) {
  const phone = normalizePhone(d.phone);
  const [found] = await tx.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  if (found) {
    const patch: Partial<Customer> = {};
    if (d.email && !found.email) patch.email = d.email;
    if (d.address && !found.address) patch.address = d.address;
    if (d.userId && !found.userId) patch.userId = d.userId;
    if (Object.keys(patch).length) await tx.update(customers).set({ ...patch, updatedAt: new Date() }).where(eq(customers.id, found.id));
    return found;
  }
  const c = await insertCustomer(tx, {
    name: d.name,
    phone,
    whatsapp: phone,
    email: d.email ?? "",
    address: (d.address as z.output<typeof addressSchema>) ?? null,
    preferredSlotId: null,
    foodPreferences: "",
    instructions: "",
    notes: "",
    userId: d.userId ?? null,
  });
  await audit(tx, "customer", c.id, "created from website order", { after: { code: c.code, name: c.name } });
  return c;
}

export type CustomerRow = Customer & {
  status: CustomerStatus;
  current: { id: string; number: string; planName: string; endDate: string; status: string } | null;
  balance: number;
};

/** List with search (name, phone or code) and status filter. */
export async function listCustomers(opts: { q?: string; status?: string } = {}): Promise<CustomerRow[]> {
  const q = opts.q?.trim();
  const digits = q?.replace(/\D/g, "");
  const where = q
    ? or(ilike(customers.name, `%${q}%`), ilike(customers.code, `%${q}%`), digits && digits.length >= 3 ? ilike(customers.phone, `%${digits}%`) : undefined)
    : undefined;
  const rows = await db.select().from(customers).where(where).orderBy(asc(customers.name)).limit(500);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [subs, ledger] = await Promise.all([
    db
      .select({ id: subscriptions.id, customerId: subscriptions.customerId, number: subscriptions.number, planName: subscriptions.planName, status: subscriptions.status, endDate: subscriptions.endDate, total: subscriptions.total, isTrial: subscriptionPlans.isTrial, createdAt: subscriptions.createdAt })
      .from(subscriptions)
      .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
      .where(inArray(subscriptions.customerId, ids))
      .orderBy(desc(subscriptions.createdAt)),
    db.select({ customerId: payments.customerId, subscriptionId: payments.subscriptionId, type: payments.type, amount: payments.amount, status: payments.status }).from(payments).where(inArray(payments.customerId, ids)),
  ]);
  const today = istParts().dateStr;
  const out = rows.map((c) => {
    const mine = subs.filter((s) => s.customerId === c.id);
    const status = customerStatus(c.manualStatus, mine.map((s) => ({ status: s.status, endDate: s.endDate, isTrial: !!s.isTrial })), today);
    const cur = mine.find((s) => ["ACTIVE", "PAUSED", "PENDING_PAYMENT"].includes(s.status)) ?? null;
    // Balance owed across the customer's (not cancelled) subscriptions.
    const billed = mine.filter((s) => s.status !== "CANCELLED").reduce((t, s) => t + s.total, 0);
    const paidForSubs = ledgerTotals(ledger.filter((l) => l.customerId === c.id && l.subscriptionId)).net;
    return { ...c, status, current: cur && { id: cur.id, number: cur.number, planName: cur.planName, endDate: cur.endDate, status: cur.status }, balance: Math.max(0, billed - paidForSubs) };
  });
  return opts.status ? out.filter((c) => c.status === opts.status || (opts.status === "DUE" && c.balance > 0)) : out;
}

export async function getCustomer(id: string) {
  const [c] = await db.select().from(customers).where(eq(customers.id, id));
  if (!c) return null;
  const [subs, pays, ords] = await Promise.all([
    db
      .select({ sub: subscriptions, isTrial: subscriptionPlans.isTrial })
      .from(subscriptions)
      .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
      .where(eq(subscriptions.customerId, id))
      .orderBy(desc(subscriptions.createdAt)),
    db.select().from(payments).where(eq(payments.customerId, id)).orderBy(desc(payments.paidAt)),
    db.select().from(orders).where(and(eq(orders.customerId, id), eq(orders.kind, "ORDER"))).orderBy(desc(orders.createdAt)).limit(50),
  ]);
  const today = istParts().dateStr;
  const status = customerStatus(c.manualStatus, subs.map((s) => ({ status: s.sub.status, endDate: s.sub.endDate, isTrial: !!s.isTrial })), today);
  return { customer: c, status, subscriptions: subs.map((s) => ({ ...s.sub, isTrial: !!s.isTrial })), payments: pays, orders: ords };
}
