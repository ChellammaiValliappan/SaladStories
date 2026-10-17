import "server-only";
import crypto from "crypto";
import { z } from "zod";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { addresses, couponRedemptions, coupons, db, orderEvents, orderItems, orders } from "@/db";
import { customerKeyOf, liveRedemptions, quoteCart, cartItemSchema } from "./pricing";
import { checkSlotBookable, PENDING_HOLD_MINUTES, PINCODE_RE } from "./delivery";
import { razorpay, razorpayConfigured, simulatorEnabled } from "./razorpay";
import { notifyNewOrder, notifyPaymentRejected, notifyPaymentToVerify, notifyStatusChange } from "./notify";
import { istParts } from "./time";
import { getSettings } from "./settings";
import { hiddenMethods } from "./payment-methods";
import { UPI_ID_RE, UTR_RE } from "./upi";

export const checkoutSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  contact: z.object({
    name: z.string().trim().min(2, "Enter your full name").max(80),
    phone: z
      .string()
      .trim()
      .transform((v) => v.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""))
      .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(120),
  }),
  address: z.object({
    house: z.string().trim().min(1, "Enter your house or flat number").max(80),
    building: z.string().trim().max(120).default(""),
    street: z.string().trim().max(120).default(""),
    area: z.string().trim().min(2, "Enter your area").max(80),
    city: z.string().trim().max(60).default("Chennai"),
    state: z.string().trim().max(60).default("Tamil Nadu"),
    pincode: z.string().trim().regex(PINCODE_RE, "Enter a valid 6-digit PIN code"),
    landmark: z.string().trim().max(120).default(""),
    instructions: z.string().trim().max(300).default(""),
  }),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a delivery date"),
  slotId: z.string().min(1, "Choose a delivery slot"),
  couponCode: z.string().trim().max(40).optional().nullable(),
  items: z.array(cartItemSchema).min(1, "Your cart is empty").max(40),
  saveAddress: z.boolean().optional(),
  acceptedPolicy: z.literal(true, { message: "Please confirm you've read the cancellation and refund policy" }),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export class CheckoutError extends Error {}

type OrderRow = typeof orders.$inferSelect;

function newOrderNumber() {
  const { dateStr } = istParts();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = Array.from(crypto.randomBytes(5), (b) => alphabet[b % alphabet.length]).join("");
  return `SS${dateStr.slice(2).replace(/-/g, "")}-${rand}`;
}

type PayOpts = { hide?: string[]; upi?: boolean };

export function paymentPayload(order: OrderRow, opts: PayOpts = {}) {
  const hide = opts.hide ?? [];
  const unpaid = order.paymentStatus !== "PAID";
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    trackingToken: order.trackingToken,
    amount: order.total,
    paid: order.paymentStatus === "PAID",
    razorpay:
      order.razorpayOrderId && razorpayConfigured()
        ? { keyId: process.env.RAZORPAY_KEY_ID!, orderId: order.razorpayOrderId, hide }
        : null,
    // Google Pay / UPI: the customer finishes paying on the order page.
    upi: !!opts.upi && unpaid,
    simulate: !opts.upi && simulatorEnabled() && unpaid,
    prefill: { name: order.customerName, email: order.email, contact: order.phone },
  };
}
export type PaymentPayload = ReturnType<typeof paymentPayload>;

const isSerializationFailure = (e: unknown) =>
  typeof e === "object" && e !== null && ((e as { code?: string }).code === "40001" || (e as { cause?: { code?: string } }).cause?.code === "40001");
const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505");

async function findByIdempotencyKey(key: string) {
  const [row] = await db.select().from(orders).where(eq(orders.idempotencyKey, key));
  return row;
}

/**
 * BRD §10.1 steps 1–4: validate everything on the server, create a pending
 * order, reserve any limited coupon, then create the Razorpay order.
 */
export async function createOrder(input: CheckoutInput, userId: string | null): Promise<PaymentPayload> {
  const settings = await getSettings();
  const useUpi = settings.paymentMode === "UPI";
  const pay: PayOpts = { hide: hiddenMethods(settings.paymentMethods), upi: useUpi };
  // Same submission retried (double click / slow network) → return the same order.
  const existing = await findByIdempotencyKey(input.idempotencyKey);
  if (existing) return paymentPayload(existing, pay);

  if (useUpi ? !UPI_ID_RE.test(settings.upiId) : !razorpayConfigured() && !simulatorEnabled())
    throw new CheckoutError("Online payment isn't set up yet. Please contact us on WhatsApp to order.");

  const customerKey = customerKeyOf(input.contact.email, input.contact.phone)!;
  const code = input.couponCode?.trim().toUpperCase() || null;

  // A customer retrying after abandoning payment shouldn't be blocked by
  // their own earlier, unpaid reservation of the same coupon.
  if (code) {
    const [c] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, code));
    if (c) {
      const stale = await db
        .select({ id: couponRedemptions.id })
        .from(couponRedemptions)
        .innerJoin(orders, eq(couponRedemptions.orderId, orders.id))
        .where(
          and(
            eq(couponRedemptions.couponId, c.id),
            eq(couponRedemptions.customerKey, customerKey),
            eq(couponRedemptions.status, "RESERVED"),
            inArray(orders.paymentStatus, ["CREATED", "FAILED"]),
          ),
        );
      if (stale.length)
        await db
          .update(couponRedemptions)
          .set({ status: "RELEASED" })
          .where(inArray(couponRedemptions.id, stale.map((s) => s.id)));
    }
  }

  // Re-price everything from the database.
  const quote = await quoteCart({
    items: input.items,
    couponCode: code,
    pincode: input.address.pincode,
    email: input.contact.email,
    phone: input.contact.phone,
    deliveryDate: input.deliveryDate,
  });
  if (quote.blockers.length) throw new CheckoutError(quote.blockers[0]);
  if (quote.coupon && !quote.coupon.ok) throw new CheckoutError(`${quote.coupon.message} Remove the coupon to continue.`);

  const slot = await checkSlotBookable(input.deliveryDate, input.slotId);
  if (!slot.ok) throw new CheckoutError(slot.message);

  const lines = quote.lines.filter((l) => !l.issue);
  const couponId = quote.coupon?.ok ? quote.coupon.couponId : undefined;

  // Create the order and reserve the coupon atomically (serializable), so two
  // simultaneous checkouts can't both take the last use of a limited coupon.
  const create = () =>
    db.transaction(
      async (tx) => {
        if (couponId) {
          const [c] = await tx.select().from(coupons).where(eq(coupons.id, couponId));
          if (!c || !c.isActive) throw new CheckoutError("This coupon is no longer available.");
          const [used] = await tx.select({ n: count() }).from(couponRedemptions).where(liveRedemptions(c.id));
          if (c.totalLimit != null && Number(used.n) >= c.totalLimit)
            throw new CheckoutError("This coupon has reached its redemption limit.");
          const [mine] = await tx
            .select({ n: count() })
            .from(couponRedemptions)
            .where(and(liveRedemptions(c.id), eq(couponRedemptions.customerKey, customerKey)));
          if (c.perCustomerLimit != null && Number(mine.n) >= c.perCustomerLimit)
            throw new CheckoutError("You've already used this coupon.");
        }

        const [order] = await tx
          .insert(orders)
          .values({
            orderNumber: newOrderNumber(),
            trackingToken: crypto.randomBytes(16).toString("hex"),
            idempotencyKey: input.idempotencyKey,
            userId,
            customerName: input.contact.name,
            phone: input.contact.phone,
            email: input.contact.email,
            address: input.address,
            pincode: input.address.pincode,
            areaId: quote.area?.id,
            slotId: input.slotId,
            deliveryDate: input.deliveryDate,
            slotLabel: slot.label,
            subtotal: quote.totals.subtotal,
            discount: quote.totals.discount,
            deliveryFee: quote.totals.deliveryFee,
            tax: quote.totals.tax,
            total: quote.totals.total,
            couponCode: couponId ? quote.coupon!.code : null,
          })
          .returning();

        await tx.insert(orderItems).values(
          lines.map((l) => ({
            orderId: order.id,
            productId: l.productId,
            name: l.name,
            image: l.image,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
            selections: l.selections,
            summary: l.summary,
          })),
        );
        await tx.insert(orderEvents).values({ orderId: order.id, status: "PENDING_PAYMENT", note: "Order placed, waiting for payment" });
        if (couponId) {
          await tx.insert(couponRedemptions).values({
            couponId,
            orderId: order.id,
            customerKey,
            status: "RESERVED",
            expiresAt: new Date(Date.now() + PENDING_HOLD_MINUTES * 60_000),
          });
        }
        return order;
      },
      { isolationLevel: "serializable" },
    );

  let order: OrderRow;
  for (let attempt = 0; ; attempt++) {
    try {
      order = await create();
      break;
    } catch (err) {
      if (isSerializationFailure(err) && attempt < 3) continue;
      if (isUniqueViolation(err)) {
        const again = await findByIdempotencyKey(input.idempotencyKey);
        if (again) return paymentPayload(again, pay);
      }
      throw err;
    }
  }

  // Save the address for logged-in customers who asked us to.
  if (userId && input.saveAddress) {
    const [{ n }] = await db.select({ n: count() }).from(addresses).where(eq(addresses.userId, userId));
    await db.insert(addresses).values({
      userId,
      fullName: input.contact.name,
      phone: input.contact.phone,
      ...input.address,
      isDefault: Number(n) === 0,
    });
  }

  // Fully discounted (₹0) orders need no payment.
  if (order.total === 0) {
    await markOrderPaid(order.id, { paymentId: null, method: "free" });
    return paymentPayload({ ...order, paymentStatus: "PAID" }, pay);
  }

  if (!useUpi && razorpayConfigured()) {
    try {
      const rzp = await razorpay().orders.create({
        amount: order.total,
        currency: "INR",
        receipt: order.orderNumber,
        notes: { orderNumber: order.orderNumber, orderId: order.id },
      });
      [order] = await db.update(orders).set({ razorpayOrderId: rzp.id }).where(eq(orders.id, order.id)).returning();
    } catch (err) {
      console.error("[razorpay order create failed]", err);
      throw new CheckoutError("We couldn't start the payment. Please try again in a moment.");
    }
  }
  return paymentPayload(order, pay);
}

/** Idempotent: safe to call from both the checkout callback and the webhook. */
export async function markOrderPaid(orderId: string, info: { paymentId: string | null; method?: string | null }) {
  const changed = await db.transaction(async (tx) => {
    const res = await tx
      .update(orders)
      .set({
        paymentStatus: "PAID",
        status: "PAID",
        razorpayPaymentId: info.paymentId ?? undefined,
        paymentMethod: info.method ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, orderId), ne(orders.paymentStatus, "PAID")))
      .returning({ id: orders.id });
    if (!res.length) return false;
    await tx.update(couponRedemptions).set({ status: "REDEEMED" }).where(eq(couponRedemptions.orderId, orderId));
    await tx.insert(orderEvents).values({ orderId, status: "PAID", note: "Payment confirmed" });
    return true;
  });
  if (changed) {
    const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } });
    if (order) {
      await notifyNewOrder(order);
      await db.update(orders).set({ notifiedAt: new Date() }).where(eq(orders.id, orderId));
    }
  }
  return changed;
}

export async function markPaymentFailed(orderId: string, reason?: string) {
  await db.transaction(async (tx) => {
    const res = await tx
      .update(orders)
      .set({ paymentStatus: "FAILED", updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), inArray(orders.paymentStatus, ["CREATED", "FAILED"])))
      .returning({ id: orders.id });
    if (res.length) {
      await tx
        .update(couponRedemptions)
        .set({ status: "RELEASED" })
        .where(and(eq(couponRedemptions.orderId, orderId), eq(couponRedemptions.status, "RESERVED")));
      await tx.insert(orderEvents).values({ orderId, status: "PAYMENT_FAILED", note: reason || "Payment failed" });
    }
  });
}

export const ORDER_STATUSES = ["PAID", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"] as const;

export async function setOrderStatus(orderId: string, status: string, note?: string) {
  await db.update(orders).set({ status, updatedAt: new Date() }).where(eq(orders.id, orderId));
  await db.insert(orderEvents).values({ orderId, status, note: note ?? "" });
  if (status === "CANCELLED") {
    await db
      .update(couponRedemptions)
      .set({ status: "RELEASED" })
      .where(and(eq(couponRedemptions.orderId, orderId), eq(couponRedemptions.status, "RESERVED")));
  }
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } });
  if (order && ["PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(status)) await notifyStatusChange(order);
  return order;
}


// ---------------- Google Pay / UPI (confirmed by the owner) ----------------

/** How long a reported-but-unconfirmed UPI payment keeps its coupon reserved. */
const VERIFY_HOLD_HOURS = 48;

export async function submitUpiPayment(orderId: string, trackingToken: string, utr: string) {
  const ref = utr.replace(/\s/g, "");
  if (!UTR_RE.test(ref)) throw new CheckoutError("Enter the 12-digit UPI transaction ID shown in Google Pay.");
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.trackingToken, trackingToken)));
  if (!order) throw new CheckoutError("Order not found.");
  if (order.paymentStatus === "PAID") return order;
  if (order.status === "CANCELLED") throw new CheckoutError("This order was cancelled. Please place a new order.");

  // The same transaction ID can't pay for two orders.
  const [dupe] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.upiRef, ref), ne(orders.id, orderId)));
  if (dupe) throw new CheckoutError("That transaction ID is already linked to another order. Please check it and try again.");

  const [updated] = await db
    .update(orders)
    .set({ paymentStatus: "VERIFYING", upiRef: ref, paymentMethod: "UPI (Google Pay)", updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), ne(orders.paymentStatus, "PAID")))
    .returning();
  await db
    .update(couponRedemptions)
    .set({ status: "RESERVED", expiresAt: new Date(Date.now() + VERIFY_HOLD_HOURS * 3600_000) })
    .where(and(eq(couponRedemptions.orderId, orderId), ne(couponRedemptions.status, "REDEEMED")));
  await db.insert(orderEvents).values({ orderId, status: "PAYMENT_SUBMITTED", note: `Customer reported UPI payment, transaction ID ${ref}` });

  const full = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } });
  if (full) await notifyPaymentToVerify(full);
  return updated ?? order;
}

/** Owner saw the money arrive → order becomes Paid and the customer is emailed. */
export async function confirmUpiPayment(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new CheckoutError("Order not found.");
  return markOrderPaid(orderId, { paymentId: order.upiRef ? `UPI ${order.upiRef}` : null, method: "UPI (Google Pay)" });
}

/** Owner couldn't find the money → customer is told and can pay again. */
export async function rejectUpiPayment(orderId: string, reason?: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.paymentStatus === "PAID") return;
  await db.update(orders).set({ paymentStatus: "FAILED", upiRef: null, updatedAt: new Date() }).where(eq(orders.id, orderId));
  await db
    .update(couponRedemptions)
    .set({ status: "RELEASED" })
    .where(and(eq(couponRedemptions.orderId, orderId), eq(couponRedemptions.status, "RESERVED")));
  await db.insert(orderEvents).values({ orderId, status: "PAYMENT_FAILED", note: reason || "Payment not received" });
  const full = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } });
  if (full) await notifyPaymentRejected(full, reason);
}
