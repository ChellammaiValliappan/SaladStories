/**
 * Salad Stories data model (PostgreSQL via Drizzle ORM).
 * Money is stored as integer paise (₹1 = 100 paise) to avoid rounding errors.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export type Selections = Record<string, Record<string, number>>;
export type AddressData = {
  house: string;
  building?: string;
  street?: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  instructions?: string;
};

// ---------- People ----------

export const users = pgTable("users", {
  id: id(),
  email: text("email").unique(),
  phone: text("phone"),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("CUSTOMER"), // CUSTOMER | ADMIN
  isBlocked: boolean("is_blocked").notNull().default(false),
  createdAt: createdAt(),
});

export const addresses = pgTable("addresses", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Home"),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  house: text("house").notNull(),
  building: text("building").notNull().default(""),
  street: text("street").notNull().default(""),
  area: text("area").notNull(),
  city: text("city").notNull().default("Chennai"),
  state: text("state").notNull().default("Tamil Nadu"),
  pincode: text("pincode").notNull(),
  landmark: text("landmark").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  isDefault: boolean("is_default").notNull().default(false),
});

export const carts = pgTable("carts", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  items: jsonb("items").$type<{ productId: string; quantity: number; selections: Selections }[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Menu ----------

export const categories = pgTable("categories", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const products = pgTable("products", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  shortDescription: text("short_description").notNull().default(""),
  description: text("description").notNull().default(""),
  image: text("image"),
  gallery: jsonb("gallery").$type<string[]>().notNull().default([]),
  accent: text("accent").notNull().default("leaf"), // colour theme for cards
  basePrice: integer("base_price").notNull(), // paise
  discountPrice: integer("discount_price"), // paise
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  isVeg: boolean("is_veg").notNull().default(true),
  containsEgg: boolean("contains_egg").notNull().default(false),
  ingredients: jsonb("ingredients").$type<string[]>().notNull().default([]),
  portionSize: text("portion_size").notNull().default(""),
  servingInfo: text("serving_info").notNull().default(""),
  proteinG: real("protein_g"),
  calories: integer("calories"),
  carbsG: real("carbs_g"),
  fatG: real("fat_g"),
  fibreG: real("fibre_g"),
  nutritionVerified: boolean("nutrition_verified").notNull().default(false),
  allergens: text("allergens").notNull().default(""),
  prepTimeMins: integer("prep_time_mins"),
  status: text("status").notNull().default("DRAFT"), // DRAFT | PUBLISHED | UNAVAILABLE
  stockStatus: text("stock_status").notNull().default("IN_STOCK"), // IN_STOCK | SOLD_OUT
  dailyLimit: integer("daily_limit"),
  maxPerOrder: integer("max_per_order"),
  sortOrder: integer("sort_order").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const optionGroups = pgTable("option_groups", {
  id: id(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // SINGLE | MULTIPLE | YESNO | QUANTITY | ADDON | REMOVAL
  required: boolean("required").notNull().default(false),
  minSelect: integer("min_select").notNull().default(0),
  maxSelect: integer("max_select"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const optionChoices = pgTable("option_choices", {
  id: id(),
  groupId: text("group_id").notNull().references(() => optionGroups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceDelta: integer("price_delta").notNull().default(0), // paise per unit
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  maxQty: integer("max_qty"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------- Delivery ----------

export const deliveryAreas = pgTable("delivery_areas", {
  id: id(),
  name: text("name").notNull(),
  pincodes: text("pincodes").notNull(), // comma separated
  fee: integer("fee"), // paise; null = flat fee from settings
  minOrder: integer("min_order"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const deliverySlots = pgTable("delivery_slots", {
  id: id(),
  name: text("name").notNull(),
  startTime: text("start_time").notNull(), // "12:30" (IST)
  endTime: text("end_time").notNull(),
  cutoffMinutes: integer("cutoff_minutes").notNull().default(60),
  maxOrders: integer("max_orders").notNull().default(20),
  daysOfWeek: text("days_of_week").notNull().default("0,1,2,3,4,5,6"), // 0 = Sunday
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const blackoutDates = pgTable("blackout_dates", {
  id: id(),
  date: text("date").notNull().unique(), // YYYY-MM-DD
  reason: text("reason").notNull().default(""),
});

export const deliveryInterests = pgTable("delivery_interests", {
  id: id(),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull(),
  pincode: text("pincode").notNull(),
  createdAt: createdAt(),
});

// ---------- Store settings (single row, id = 1) ----------

export const storeSettings = pgTable("store_settings", {
  id: integer("id").primaryKey().default(1),
  businessName: text("business_name").notNull().default("Salad Stories"),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""), // digits incl. country code
  address: text("address").notNull().default(""),
  instagram: text("instagram").notNull().default(""),
  facebook: text("facebook").notNull().default(""),
  youtube: text("youtube").notNull().default(""),
  announcement: text("announcement").notNull().default(""),
  flatDeliveryFee: integer("flat_delivery_fee").notNull().default(4000),
  freeDeliveryAbove: integer("free_delivery_above"),
  minOrderValue: integer("min_order_value").notNull().default(0),
  taxPercent: real("tax_percent").notNull().default(5),
  taxLabel: text("tax_label").notNull().default("GST"),
  taxInclusive: boolean("tax_inclusive").notNull().default(false),
  sameDayOrders: boolean("same_day_orders").notNull().default(true),
  advanceDays: integer("advance_days").notNull().default(3),
  deliveryPaused: boolean("delivery_paused").notNull().default(false),
  pausedMessage: text("paused_message").notNull().default("We're not taking orders right now. Please check back soon."),
  disabledCouponTypes: text("disabled_coupon_types").notNull().default(""),
  // Razorpay methods offered at checkout (they must also be enabled on the Razorpay account)
  paymentMethods: text("payment_methods").notNull().default("upi,card,netbanking,wallet"),
  // Free owner alerts via a Telegram bot (token lives in TELEGRAM_BOT_TOKEN)
  telegramChatId: text("telegram_chat_id").notNull().default(""),
});

// ---------- Coupons ----------

export const coupons = pgTable("coupons", {
  id: id(),
  code: text("code").notNull().unique(),
  description: text("description").notNull().default(""),
  type: text("type").notNull(), // PERCENT | FLAT | FREE_DELIVERY
  value: integer("value").notNull().default(0), // percent for PERCENT, paise for FLAT
  maxDiscount: integer("max_discount"),
  minOrder: integer("min_order"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  totalLimit: integer("total_limit"),
  perCustomerLimit: integer("per_customer_limit").default(1),
  firstOrderOnly: boolean("first_order_only").notNull().default(false),
  productIds: jsonb("product_ids").$type<string[]>().notNull().default([]),
  categoryIds: jsonb("category_ids").$type<string[]>().notNull().default([]),
  areaIds: jsonb("area_ids").$type<string[]>().notNull().default([]),
  stackable: boolean("stackable").notNull().default(false),
  campaign: text("campaign").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

// ---------- Orders & payments ----------

export const orders = pgTable(
  "orders",
  {
    id: id(),
    orderNumber: text("order_number").notNull().unique(),
    trackingToken: text("tracking_token").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    address: jsonb("address").$type<AddressData>().notNull(),
    pincode: text("pincode").notNull(),
    areaId: text("area_id").references(() => deliveryAreas.id, { onDelete: "set null" }),
    slotId: text("slot_id").references(() => deliverySlots.id, { onDelete: "set null" }),
    deliveryDate: text("delivery_date").notNull(), // YYYY-MM-DD
    slotLabel: text("slot_label").notNull(),
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull().default(0),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    tax: integer("tax").notNull().default(0),
    total: integer("total").notNull(),
    couponCode: text("coupon_code"),
    // PENDING_PAYMENT | PAID | PREPARING | OUT_FOR_DELIVERY | DELIVERED | CANCELLED
    status: text("status").notNull().default("PENDING_PAYMENT"),
    paymentStatus: text("payment_status").notNull().default("CREATED"), // CREATED | PAID | FAILED | REFUNDED
    paymentMethod: text("payment_method"),
    razorpayOrderId: text("razorpay_order_id").unique(),
    razorpayPaymentId: text("razorpay_payment_id"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_slot_idx").on(t.deliveryDate, t.slotId), index("orders_status_idx").on(t.status)],
);

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  image: text("image"),
  unitPrice: integer("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotal: integer("line_total").notNull(),
  selections: jsonb("selections").$type<Selections>().notNull().default({}),
  summary: text("summary").notNull().default(""),
});

export const orderEvents = pgTable("order_events", {
  id: id(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
});

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: id(),
    couponId: text("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
    orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    customerKey: text("customer_key").notNull(), // lower-cased email
    status: text("status").notNull(), // RESERVED | REDEEMED | RELEASED
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("redemption_order_uq").on(t.orderId), index("redemption_coupon_idx").on(t.couponId, t.status)],
);

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // Razorpay x-razorpay-event-id, for idempotency
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Content ----------

export const reviews = pgTable("reviews", {
  id: id(),
  name: text("name").notNull(),
  text: text("text").notNull(),
  rating: integer("rating"),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: createdAt(),
});

// ---------- Relations ----------

export const productRelations = relations(products, ({ many, one }) => ({
  optionGroups: many(optionGroups),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
}));
export const optionGroupRelations = relations(optionGroups, ({ many, one }) => ({
  choices: many(optionChoices),
  product: one(products, { fields: [optionGroups.productId], references: [products.id] }),
}));
export const optionChoiceRelations = relations(optionChoices, ({ one }) => ({
  group: one(optionGroups, { fields: [optionChoices.groupId], references: [optionGroups.id] }),
}));
export const orderRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  events: many(orderEvents),
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  area: one(deliveryAreas, { fields: [orders.areaId], references: [deliveryAreas.id] }),
}));
export const orderItemRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));
export const orderEventRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));
export const userRelations = relations(users, ({ many }) => ({
  addresses: many(addresses),
  orders: many(orders),
}));
export const addressRelations = relations(addresses, ({ one }) => ({
  user: one(users, { fields: [addresses.userId], references: [users.id] }),
}));
export const categoryRelations = relations(categories, ({ many }) => ({ products: many(products) }));
