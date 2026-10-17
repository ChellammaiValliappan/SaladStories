"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import crypto from "crypto";
import {
  blackoutDates,
  categories,
  coupons,
  db,
  deliveryAreas,
  deliveryInterests,
  deliverySlots,
  optionChoices,
  optionGroups,
  orderEvents,
  orders,
  products,
  reviews,
  storeSettings,
  users,
} from "@/db";
import { hashPassword, requireAdmin, requireStaff } from "@/lib/auth";
import { confirmUpiPayment, rejectUpiPayment, setOrderStatus, ORDER_STATUSES } from "@/lib/orders";
import { razorpay, razorpayConfigured } from "@/lib/razorpay";
import { UPI_ID_RE } from "@/lib/upi";

// ---------- helpers ----------
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const intOrNull = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === "" ? null : Math.round(Number(v));
};
const floatOrNull = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === "" ? null : Number(v);
};
/** Rupee input → paise, or null when blank. */
const paiseOrNull = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === "" ? null : Math.round(Number(v) * 100);
};
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const list = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);

/** Send the admin back with a readable error instead of a crash page. */
function oops(pathname: string, message: string): never {
  redirect(`${pathname}${pathname.includes("?") ? "&" : "?"}err=${encodeURIComponent(message)}`);
}

function done(pathname: string, msg = "saved"): never {
  revalidatePath("/", "layout");
  redirect(`${pathname}${pathname.includes("?") ? "&" : "?"}msg=${msg}`);
}

// ---------- Orders ----------

export async function updateOrderStatus(form: FormData) {
  await requireStaff();
  const id = str(form, "orderId");
  const status = str(form, "status");
  if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) oops(`/admin/orders/${id}`, "Invalid status");
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) oops(`/admin/orders/${id}`, "Order not found");
  if (order.paymentStatus !== "PAID" && status !== "CANCELLED") oops(`/admin/orders/${id}`, "Only paid orders can move forward.");
  await setOrderStatus(id, status, str(form, "note") || undefined);
  done(`/admin/orders/${id}`, "status");
}

export async function refundOrder(form: FormData) {
  await requireAdmin();
  const id = str(form, "orderId");
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order || order.paymentStatus !== "PAID") oops(`/admin/orders/${id}`, "Only paid orders can be refunded.");
  const amount = paiseOrNull(form, "amount") ?? order.total;
  if (amount <= 0 || amount > order.total) oops(`/admin/orders/${id}`, "Refund amount must be between ₹1 and the order total.");
  let note = `Refund of ₹${amount / 100}`;
  if (razorpayConfigured() && order.razorpayPaymentId && !order.razorpayPaymentId.startsWith("sim_")) {
    try {
      const r = await razorpay().payments.refund(order.razorpayPaymentId, { amount, notes: { orderNumber: order.orderNumber } });
      note += ` (Razorpay ${r.id})`;
    } catch (err) {
      const msg = (err as { error?: { description?: string } })?.error?.description ?? "Razorpay rejected the refund.";
      oops(`/admin/orders/${id}`, msg);
    }
  } else {
    note += " (recorded only — no live payment)";
  }
  await db.update(orders).set({ paymentStatus: "REFUNDED", updatedAt: new Date() }).where(eq(orders.id, id));
  await db.insert(orderEvents).values({ orderId: id, status: "REFUNDED", note });
  if (order.status !== "DELIVERED") await setOrderStatus(id, "CANCELLED", "Cancelled with refund");
  done(`/admin/orders/${id}`, "refunded");
}

// ---------- Products ----------

const choiceSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  priceDelta: z.number().int(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  maxQty: z.number().int().positive().nullable(),
});
const groupSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  type: z.enum(["SINGLE", "MULTIPLE", "YESNO", "QUANTITY", "ADDON", "REMOVAL"]),
  required: z.boolean(),
  minSelect: z.number().int().min(0),
  maxSelect: z.number().int().positive().nullable(),
  isActive: z.boolean(),
  choices: z.array(choiceSchema).min(1, "Every option group needs at least one choice"),
});

export async function saveProduct(form: FormData) {
  await requireAdmin();
  const id = str(form, "id") || null;
  const name = str(form, "name");
  if (!name) oops(id ? `/admin/products/${id}` : "/admin/products/new", "Name is required");
  const basePrice = paiseOrNull(form, "basePrice");
  if (basePrice == null || basePrice < 0) oops(id ? `/admin/products/${id}` : "/admin/products/new", "Base price is required");
  const parsedGroups = z.array(groupSchema).safeParse(JSON.parse(str(form, "optionGroups") || "[]"));
  if (!parsedGroups.success) oops(id ? `/admin/products/${id}` : "/admin/products/new", `Customization options: ${parsedGroups.error.issues[0].message}`);
  const groups = parsedGroups.data;

  const data = {
    name,
    slug: slugify(str(form, "slug") || name),
    shortDescription: str(form, "shortDescription"),
    description: str(form, "description"),
    image: str(form, "image") || null,
    gallery: str(form, "gallery").split("\n").map((s) => s.trim()).filter(Boolean),
    accent: str(form, "accent") || "leaf",
    basePrice,
    discountPrice: paiseOrNull(form, "discountPrice"),
    categoryId: str(form, "categoryId") || null,
    isVeg: str(form, "foodType") === "veg",
    containsEgg: str(form, "foodType") === "egg",
    ingredients: str(form, "ingredients").split(/\n|,/).map((s) => s.trim()).filter(Boolean),
    portionSize: str(form, "portionSize"),
    servingInfo: str(form, "servingInfo"),
    proteinG: floatOrNull(form, "proteinG"),
    calories: intOrNull(form, "calories"),
    carbsG: floatOrNull(form, "carbsG"),
    fatG: floatOrNull(form, "fatG"),
    fibreG: floatOrNull(form, "fibreG"),
    nutritionVerified: bool(form, "nutritionVerified"),
    allergens: str(form, "allergens"),
    prepTimeMins: intOrNull(form, "prepTimeMins"),
    status: str(form, "status") || "DRAFT",
    stockStatus: str(form, "stockStatus") || "IN_STOCK",
    dailyLimit: intOrNull(form, "dailyLimit"),
    maxPerOrder: intOrNull(form, "maxPerOrder"),
    sortOrder: intOrNull(form, "sortOrder") ?? 0,
    featured: bool(form, "featured"),
    updatedAt: new Date(),
  };

  const [slugClash] = await db.select({ id: products.id }).from(products).where(eq(products.slug, data.slug));
  if (slugClash && slugClash.id !== id)
    oops(id ? `/admin/products/${id}` : "/admin/products/new", `Another item already uses the web address "${data.slug}". Change the slug.`);

  const productId = await db.transaction(async (tx) => {
    let pid = id;
    if (pid) await tx.update(products).set(data).where(eq(products.id, pid));
    else [{ id: pid }] = await tx.insert(products).values(data).returning({ id: products.id });

    // Sync option groups and choices, keeping existing ids so customers' carts stay valid.
    const keepGroups = groups.map((g) => g.id).filter(Boolean) as string[];
    await tx
      .delete(optionGroups)
      .where(and(eq(optionGroups.productId, pid!), keepGroups.length ? notInArray(optionGroups.id, keepGroups) : undefined));
    for (const [gi, g] of groups.entries()) {
      const gData = { name: g.name, type: g.type, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, isActive: g.isActive, sortOrder: gi };
      let gid = g.id;
      if (gid) await tx.update(optionGroups).set(gData).where(and(eq(optionGroups.id, gid), eq(optionGroups.productId, pid!)));
      else [{ id: gid }] = await tx.insert(optionGroups).values({ ...gData, productId: pid! }).returning({ id: optionGroups.id });
      const keepChoices = g.choices.map((c) => c.id).filter(Boolean) as string[];
      await tx
        .delete(optionChoices)
        .where(and(eq(optionChoices.groupId, gid!), keepChoices.length ? notInArray(optionChoices.id, keepChoices) : undefined));
      for (const [ci, c] of g.choices.entries()) {
        const cData = { name: c.name, priceDelta: c.priceDelta, isDefault: c.isDefault, isActive: c.isActive, maxQty: c.maxQty, sortOrder: ci };
        if (c.id) await tx.update(optionChoices).set(cData).where(and(eq(optionChoices.id, c.id), eq(optionChoices.groupId, gid!)));
        else await tx.insert(optionChoices).values({ ...cData, groupId: gid! });
      }
    }
    return pid!;
  });
  done(`/admin/products/${productId}`);
}

export async function setProductAvailability(form: FormData) {
  await requireStaff();
  const id = str(form, "id");
  const field = str(form, "field");
  const value = str(form, "value");
  if (field === "status" && ["DRAFT", "PUBLISHED", "UNAVAILABLE"].includes(value))
    await db.update(products).set({ status: value, updatedAt: new Date() }).where(eq(products.id, id));
  if (field === "stockStatus" && ["IN_STOCK", "SOLD_OUT"].includes(value))
    await db.update(products).set({ stockStatus: value, updatedAt: new Date() }).where(eq(products.id, id));
  done("/admin/products");
}

export async function deleteProduct(form: FormData) {
  await requireAdmin();
  await db.delete(products).where(eq(products.id, str(form, "id")));
  done("/admin/products", "deleted");
}

/** Image upload: Cloudinary when configured, otherwise /public/uploads (local / VPS only). */
export async function uploadImage(form: FormData): Promise<{ url?: string; error?: string }> {
  await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  if (!file.type.startsWith("image/")) return { error: "That file isn't an image." };
  if (file.size > 5 * 1024 * 1024) return { error: "Images must be under 5 MB." };

  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const preset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (cloud && preset) {
    const body = new FormData();
    body.append("file", file);
    body.append("upload_preset", preset);
    body.append("folder", "salad-stories");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body });
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message ?? "Upload failed." };
    return { url: data.secure_url as string };
  }
  if (process.env.VERCEL || process.env.NETLIFY) return { error: "Set up Cloudinary to upload photos on the live site (see docs/SETUP.md), or paste an image URL." };
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = `${crypto.randomBytes(8).toString("hex")}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return { url: `/uploads/${name}` };
}

// ---------- Coupons ----------

export async function saveCoupon(form: FormData) {
  await requireAdmin();
  const id = str(form, "id") || null;
  const type = str(form, "type");
  const code = str(form, "code").toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) oops(id ? `/admin/coupons?edit=${id}` : "/admin/coupons?edit=new", "Use 3–30 letters, numbers, - or _ for the code.");
  const date = (k: string) => (str(form, k) ? new Date(`${str(form, k)}T${k === "expiresAt" ? "23:59:59" : "00:00:00"}+05:30`) : null);
  const data = {
    code,
    description: str(form, "description"),
    type,
    value: type === "PERCENT" ? Math.min(100, intOrNull(form, "value") ?? 0) : type === "FLAT" ? paiseOrNull(form, "value") ?? 0 : 0,
    maxDiscount: paiseOrNull(form, "maxDiscount"),
    minOrder: paiseOrNull(form, "minOrder"),
    startsAt: date("startsAt"),
    expiresAt: date("expiresAt"),
    totalLimit: intOrNull(form, "totalLimit"),
    perCustomerLimit: intOrNull(form, "perCustomerLimit"),
    firstOrderOnly: bool(form, "firstOrderOnly"),
    productIds: list(form, "productIds"),
    categoryIds: list(form, "categoryIds"),
    areaIds: list(form, "areaIds"),
    stackable: false,
    campaign: str(form, "campaign"),
    isActive: bool(form, "isActive"),
  };
  const [clash] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, code));
  if (clash && clash.id !== id) {
    oops(id ? `/admin/coupons?edit=${id}` : "/admin/coupons?edit=new", `The code ${code} is already in use.`);
  }
  if (id) await db.update(coupons).set(data).where(eq(coupons.id, id));
  else await db.insert(coupons).values(data);
  done("/admin/coupons");
}

export async function toggleCoupon(form: FormData) {
  await requireAdmin();
  await db.update(coupons).set({ isActive: str(form, "value") === "true" }).where(eq(coupons.id, str(form, "id")));
  done("/admin/coupons");
}

export async function deleteCoupon(form: FormData) {
  await requireAdmin();
  await db.delete(coupons).where(eq(coupons.id, str(form, "id")));
  done("/admin/coupons", "deleted");
}

// ---------- Delivery ----------

export async function saveArea(form: FormData) {
  await requireAdmin();
  const id = str(form, "id") || null;
  const pins = str(form, "pincodes").split(/[,\s]+/).filter((p) => /^[1-9]\d{5}$/.test(p));
  if (!str(form, "name") || pins.length === 0) oops("/admin/delivery", "Enter an area name and at least one valid PIN code.");
  const data = {
    name: str(form, "name"),
    pincodes: pins.join(", "),
    fee: paiseOrNull(form, "fee"),
    minOrder: paiseOrNull(form, "minOrder"),
    isActive: bool(form, "isActive"),
    sortOrder: intOrNull(form, "sortOrder") ?? 0,
  };
  if (id) await db.update(deliveryAreas).set(data).where(eq(deliveryAreas.id, id));
  else await db.insert(deliveryAreas).values(data);
  done("/admin/delivery");
}

export async function deleteArea(form: FormData) {
  await requireAdmin();
  await db.delete(deliveryAreas).where(eq(deliveryAreas.id, str(form, "id")));
  done("/admin/delivery", "deleted");
}

export async function saveSlot(form: FormData) {
  await requireAdmin();
  const id = str(form, "id") || null;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(str(form, "startTime")) || !time.test(str(form, "endTime"))) oops("/admin/delivery", "Use 24-hour times like 12:30.");
  const data = {
    name: str(form, "name") || "Slot",
    startTime: str(form, "startTime"),
    endTime: str(form, "endTime"),
    cutoffMinutes: intOrNull(form, "cutoffMinutes") ?? 60,
    maxOrders: intOrNull(form, "maxOrders") ?? 20,
    daysOfWeek: list(form, "days").join(",") || "0,1,2,3,4,5,6",
    isActive: bool(form, "isActive"),
    sortOrder: intOrNull(form, "sortOrder") ?? 0,
  };
  if (id) await db.update(deliverySlots).set(data).where(eq(deliverySlots.id, id));
  else await db.insert(deliverySlots).values(data);
  done("/admin/delivery");
}

export async function deleteSlot(form: FormData) {
  await requireAdmin();
  await db.delete(deliverySlots).where(eq(deliverySlots.id, str(form, "id")));
  done("/admin/delivery", "deleted");
}

export async function addBlackout(form: FormData) {
  await requireAdmin();
  const date = str(form, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) oops("/admin/delivery", "Pick a date.");
  await db.insert(blackoutDates).values({ date, reason: str(form, "reason") }).onConflictDoNothing();
  done("/admin/delivery");
}

export async function deleteBlackout(form: FormData) {
  await requireAdmin();
  await db.delete(blackoutDates).where(eq(blackoutDates.id, str(form, "id")));
  done("/admin/delivery", "deleted");
}

export async function deleteInterest(form: FormData) {
  await requireAdmin();
  await db.delete(deliveryInterests).where(eq(deliveryInterests.id, str(form, "id")));
  done("/admin/delivery", "deleted");
}

// ---------- Customers ----------

export async function setUserBlocked(form: FormData) {
  const admin = await requireAdmin();
  const id = str(form, "id");
  if (id === admin.id) oops("/admin/customers", "You can't block yourself.");
  await db.update(users).set({ isBlocked: str(form, "value") === "true" }).where(and(eq(users.id, id), inArray(users.role, ["CUSTOMER"])));
  done("/admin/customers");
}

// ---------- Reviews ----------

export async function saveReview(form: FormData) {
  await requireAdmin();
  const name = str(form, "name");
  const text = str(form, "text");
  if (!name || !text) oops("/admin/reviews", "Add the customer's name and their review.");
  const rating = intOrNull(form, "rating");
  await db.insert(reviews).values({ name, text, rating: rating && rating >= 1 && rating <= 5 ? rating : null, isPublished: bool(form, "isPublished") });
  done("/admin/reviews");
}

export async function toggleReview(form: FormData) {
  await requireAdmin();
  await db.update(reviews).set({ isPublished: str(form, "value") === "true" }).where(eq(reviews.id, str(form, "id")));
  done("/admin/reviews");
}

export async function deleteReview(form: FormData) {
  await requireAdmin();
  await db.delete(reviews).where(eq(reviews.id, str(form, "id")));
  done("/admin/reviews", "deleted");
}

// ---------- Settings ----------

export async function saveSettings(form: FormData) {
  await requireAdmin();
  const data = {
    businessName: str(form, "businessName") || "Salad Stories",
    phone: str(form, "phone"),
    email: str(form, "email"),
    whatsapp: str(form, "whatsapp").replace(/\D/g, ""),
    address: str(form, "address"),
    instagram: str(form, "instagram"),
    facebook: str(form, "facebook"),
    youtube: str(form, "youtube"),
    announcement: str(form, "announcement"),
    flatDeliveryFee: paiseOrNull(form, "flatDeliveryFee") ?? 0,
    freeDeliveryAbove: paiseOrNull(form, "freeDeliveryAbove"),
    minOrderValue: paiseOrNull(form, "minOrderValue") ?? 0,
    taxPercent: floatOrNull(form, "taxPercent") ?? 0,
    taxLabel: str(form, "taxLabel") || "GST",
    taxInclusive: bool(form, "taxInclusive"),
    sameDayOrders: bool(form, "sameDayOrders"),
    advanceDays: Math.max(0, Math.min(30, intOrNull(form, "advanceDays") ?? 3)),
    deliveryPaused: bool(form, "deliveryPaused"),
    pausedMessage: str(form, "pausedMessage") || "We're not taking orders right now. Please check back soon.",
    disabledCouponTypes: ["PERCENT", "FLAT", "FREE_DELIVERY"].filter((t) => !bool(form, `coupon_${t}`)).join(","),
    paymentMethods: list(form, "paymentMethods").join(","),
    telegramChatId: str(form, "telegramChatId").replace(/[^0-9-]/g, ""),
    paymentMode: str(form, "paymentMode") === "RAZORPAY" ? "RAZORPAY" : "UPI",
    upiId: str(form, "upiId").toLowerCase(),
    upiName: str(form, "upiName") || "Salad Stories",
  };
  if (data.upiId && !UPI_ID_RE.test(data.upiId)) oops("/admin/settings", "That UPI ID doesn't look right. It should look like name@okaxis or 9876543210@ybl.");
  if (data.paymentMode === "UPI" && !data.upiId) oops("/admin/settings", "Add your UPI ID so customers can pay with Google Pay.");
  if (data.paymentMode === "RAZORPAY" && !data.paymentMethods) oops("/admin/settings", "Keep at least one payment method switched on.");
  await db.insert(storeSettings).values({ id: 1, ...data }).onConflictDoUpdate({ target: storeSettings.id, set: data });
  done("/admin/settings");
}

// ---------- Team (admins & staff) ----------

export async function addTeamMember(form: FormData) {
  await requireAdmin();
  const name = str(form, "name");
  const email = str(form, "email").toLowerCase();
  const role = str(form, "role") === "ADMIN" ? "ADMIN" : "STAFF";
  const password = str(form, "password");
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) oops("/admin/team", "Enter a name and a valid email.");
  if (password.length < 8) oops("/admin/team", "The temporary password needs at least 8 characters.");
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  const passwordHash = await hashPassword(password);
  if (existing) await db.update(users).set({ role, name, passwordHash, isBlocked: false }).where(eq(users.id, existing.id));
  else await db.insert(users).values({ name, email, role, passwordHash });
  done("/admin/team");
}

async function adminCount() {
  const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.isBlocked, false)));
  return rows.length;
}

export async function setTeamRole(form: FormData) {
  const me = await requireAdmin();
  const id = str(form, "id");
  const role = ["ADMIN", "STAFF", "CUSTOMER"].includes(str(form, "role")) ? str(form, "role") : "CUSTOMER";
  if (id === me.id) oops("/admin/team", "You can't change your own access. Ask another admin.");
  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (target?.role === "ADMIN" && role !== "ADMIN" && (await adminCount()) <= 1) oops("/admin/team", "There must always be at least one admin.");
  await db.update(users).set({ role }).where(eq(users.id, id));
  done("/admin/team");
}

export async function resetTeamPassword(form: FormData) {
  await requireAdmin();
  const password = str(form, "password");
  if (password.length < 8) oops("/admin/team", "The new password needs at least 8 characters.");
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, str(form, "id")));
  done("/admin/team");
}

// ---------- Categories ----------

export async function saveCategory(form: FormData) {
  await requireAdmin();
  const id = str(form, "id") || null;
  const name = str(form, "name");
  if (name.length < 2) oops("/admin/products", "Enter a category name.");
  const slug = slugify(name);
  const [clash] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  if (clash && clash.id !== id) oops("/admin/products", `A category called "${name}" already exists.`);
  const data = { name, slug, sortOrder: intOrNull(form, "sortOrder") ?? 0 };
  if (id) await db.update(categories).set(data).where(eq(categories.id, id));
  else await db.insert(categories).values(data);
  done("/admin/products");
}

export async function deleteCategory(form: FormData) {
  await requireAdmin();
  // Items in this category stay on the menu, just without a category.
  await db.delete(categories).where(eq(categories.id, str(form, "id")));
  done("/admin/products", "deleted");
}

// ---------- Kitchen ----------

/** Moves every newly paid order in one slot to "Being prepared" (emails each customer). */
export async function markSlotPreparing(form: FormData) {
  await requireStaff();
  const date = str(form, "date");
  const slotId = str(form, "slotId");
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.deliveryDate, date), eq(orders.slotId, slotId), eq(orders.status, "PAID"), eq(orders.paymentStatus, "PAID")));
  for (const r of rows) await setOrderStatus(r.id, "PREPARING", "Started from kitchen sheet");
  revalidatePath("/admin", "layout");
  redirect(`/admin/kitchen?date=${date}`);
}

// ---------- Google Pay / UPI payments ----------

export async function confirmUpi(form: FormData) {
  await requireAdmin();
  const id = str(form, "orderId");
  await confirmUpiPayment(id);
  done(`/admin/orders/${id}`, "upiConfirmed");
}

export async function rejectUpi(form: FormData) {
  await requireAdmin();
  const id = str(form, "orderId");
  await rejectUpiPayment(id, str(form, "reason") || "We couldn't find this payment in our account");
  done(`/admin/orders/${id}`, "upiRejected");
}
