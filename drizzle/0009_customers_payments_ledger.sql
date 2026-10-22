CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text DEFAULT '' NOT NULL,
	"actor_id" text,
	"actor_name" text DEFAULT 'System' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"whatsapp" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" jsonb,
	"preferred_slot_id" text,
	"food_preferences" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"manual_status" text,
	"user_id" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_no" text NOT NULL,
	"customer_id" text,
	"subscription_id" text,
	"order_id" text,
	"invoice_id" text,
	"type" text DEFAULT 'PAYMENT' NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" text DEFAULT '' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"reversal_of" text,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_receipt_no_unique" UNIQUE("receipt_no")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "plan_tier" text DEFAULT 'STANDARD' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_days" ADD COLUMN "original_date" text;--> statement-breakpoint
ALTER TABLE "subscription_days" ADD COLUMN "tier" text DEFAULT 'STANDARD' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "price_per_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "premium_surcharge_per_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "large_surcharge_per_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "is_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "source" text DEFAULT 'WEBSITE' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "weekdays" text DEFAULT '1,2,3,4,5' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "extra_authorized" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "actual_end_date" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "renewal_status" text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "renewed_from_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "activation_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_preferred_slot_id_delivery_slots_id_fk" FOREIGN KEY ("preferred_slot_id") REFERENCES "public"."delivery_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_method_reference_idx" ON "payments" USING btree ("type","method","reference");--> statement-breakpoint
CREATE INDEX "payments_customer_idx" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payments_subscription_idx" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
-- Placeholder plan prices (owner edits them in Admin → Meal plans). Monthly is 22 delivery days.
UPDATE "subscription_plans" SET "price" = 49900, "is_trial" = true, "premium_surcharge_per_day" = 3000, "large_surcharge_per_day" = 6000, "discount_percent" = 0 WHERE "code" = 'TRIAL';--> statement-breakpoint
UPDATE "subscription_plans" SET "price" = 84900, "premium_surcharge_per_day" = 3000, "large_surcharge_per_day" = 6000, "discount_percent" = 0 WHERE "code" = 'WEEKLY';--> statement-breakpoint
UPDATE "subscription_plans" SET "days" = 22, "min_days" = 22, "max_days" = 22, "price" = 349900, "premium_surcharge_per_day" = 3000, "large_surcharge_per_day" = 6000, "discount_percent" = 0,
  "description" = '22 delivery days — about a month of working-day meals.' WHERE "code" = 'MONTHLY';--> statement-breakpoint
UPDATE "subscription_plans" SET "price_per_day" = 17900, "premium_surcharge_per_day" = 3000, "large_surcharge_per_day" = 6000, "discount_percent" = 0 WHERE "code" = 'CUSTOM';--> statement-breakpoint
-- Premium tier for the higher-priced protein bowls (owner can change per bowl).
UPDATE "products" SET "plan_tier" = 'PREMIUM' WHERE "slug" IN ('high-protein-non-veg-salad', 'high-protein-paneer-bowl');--> statement-breakpoint
-- One customer per phone number from existing orders (latest details win).
INSERT INTO "customers" ("id", "code", "name", "phone", "email", "address", "user_id", "created_at")
SELECT gen_random_uuid()::text, 'CUST-' || lpad((row_number() OVER (ORDER BY first_at))::text, 4, '0'), name, phone, email, address, user_id, first_at
FROM (
  SELECT DISTINCT ON (o.phone) o.phone, o.customer_name AS name, o.email, o.address, o.user_id,
    (SELECT min(o2.created_at) FROM "orders" o2 WHERE o2.phone = o.phone) AS first_at
  FROM "orders" o ORDER BY o.phone, o.created_at DESC
) c;--> statement-breakpoint
INSERT INTO "counters" ("key", "value") VALUES ('customer', (SELECT count(*) FROM "customers")) ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
UPDATE "orders" o SET "customer_id" = c."id" FROM "customers" c WHERE c."phone" = o."phone";--> statement-breakpoint
UPDATE "subscriptions" s SET "customer_id" = c."id" FROM "customers" c WHERE c."phone" = s."phone";--> statement-breakpoint
UPDATE "subscription_days" SET "original_date" = "date" WHERE "original_date" IS NULL;--> statement-breakpoint
-- Ledger rows for orders already paid (receipt numbers in payment order).
INSERT INTO "payments" ("id", "receipt_no", "customer_id", "subscription_id", "order_id", "type", "amount", "method", "reference", "status", "paid_at", "recorded_by", "note")
SELECT gen_random_uuid()::text, 'RCPT-' || lpad((row_number() OVER (ORDER BY o.updated_at))::text, 4, '0'), o.customer_id,
  CASE WHEN o.kind = 'PLAN' THEN o.subscription_id END, o.id, 'PAYMENT', o.total,
  CASE WHEN o.upi_ref IS NOT NULL THEN 'UPI' WHEN o.razorpay_payment_id IS NOT NULL THEN 'RAZORPAY' ELSE 'OTHER' END,
  CASE WHEN o.upi_ref IS NOT NULL THEN o.upi_ref ELSE o.razorpay_payment_id END, 'RECEIVED', o.updated_at, 'Imported', 'Imported from order ' || o.order_number
FROM "orders" o WHERE o.payment_status IN ('PAID', 'REFUNDED') AND o.total > 0;--> statement-breakpoint
INSERT INTO "counters" ("key", "value") VALUES ('receipt', (SELECT count(*) FROM "payments")) ON CONFLICT ("key") DO NOTHING;
