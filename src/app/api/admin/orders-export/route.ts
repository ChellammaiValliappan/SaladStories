import { and, asc, gte, lte } from "drizzle-orm";
import { db, orders } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { addressLine } from "@/lib/notify";
import { addDays, istParts } from "@/lib/time";

export const dynamic = "force-dynamic";

const rupees = (p: number) => (p / 100).toFixed(2);

/** CSV cell: quote everything and neutralise spreadsheet formulas (=, +, -, @). */
function cell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Admin-only download of orders as CSV (opens in Excel / Google Sheets). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not allowed", { status: 403 });

  const url = new URL(req.url);
  const today = istParts().dateStr;
  const valid = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const from = valid(url.searchParams.get("from")) ?? addDays(today, -29);
  const to = valid(url.searchParams.get("to")) ?? today;
  const start = new Date(`${from}T00:00:00+05:30`);
  const end = new Date(`${to}T23:59:59.999+05:30`);

  const rows = await db.query.orders.findMany({
    where: and(gte(orders.createdAt, start), lte(orders.createdAt, end)),
    with: { items: true },
    orderBy: asc(orders.createdAt),
  });

  const header = [
    "Order number", "Placed at (IST)", "Customer", "Phone", "Email", "Address", "PIN code", "Delivery slot",
    "Items", "Subtotal (₹)", "Discount (₹)", "Coupon", "Delivery fee (₹)", "Tax (₹)", "Total (₹)",
    "Payment status", "Payment method", "Payment reference", "Order status",
  ];
  const lines = rows.map((o) =>
    [
      o.orderNumber,
      new Date(o.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      o.customerName, o.phone, o.email, addressLine(o.address), o.pincode, o.slotLabel,
      o.items.map((i) => `${i.quantity} x ${i.name}${i.summary ? ` (${i.summary})` : ""}`).join("; "),
      rupees(o.subtotal), rupees(o.discount), o.couponCode ?? "", rupees(o.deliveryFee), rupees(o.tax), rupees(o.total),
      o.paymentStatus, o.paymentMethod ?? "", o.razorpayPaymentId ?? o.upiRef ?? "", o.status,
    ].map(cell).join(","),
  );
  // BOM so Excel reads ₹ and Tamil names correctly
  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="salad-stories-orders-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
