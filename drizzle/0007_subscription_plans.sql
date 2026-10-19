CREATE TABLE "subscription_days" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"date" text NOT NULL,
	"product_id" text,
	"product_name" text NOT NULL,
	"selections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unit_price" integer NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"days" integer,
	"min_days" integer DEFAULT 2 NOT NULL,
	"max_days" integer DEFAULT 30 NOT NULL,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"delivery_fee_per_day" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"user_id" text,
	"plan_id" text,
	"plan_code" text NOT NULL,
	"plan_name" text NOT NULL,
	"status" text DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"payment_order_id" text,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"address" jsonb NOT NULL,
	"pincode" text NOT NULL,
	"area_id" text,
	"slot_id" text,
	"slot_name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"large" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"subtotal" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"delivery_fee" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"days_total" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_number_unique" UNIQUE("number"),
	CONSTRAINT "subscriptions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "kind" text DEFAULT 'ORDER' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "subscription_days" ADD CONSTRAINT "subscription_days_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_days" ADD CONSTRAINT "subscription_days_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_days" ADD CONSTRAINT "subscription_days_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_area_id_delivery_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."delivery_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_slot_id_delivery_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."delivery_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_days_sub_date_idx" ON "subscription_days" USING btree ("subscription_id","date");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
INSERT INTO "subscription_plans" ("id", "code", "name", "description", "days", "min_days", "max_days", "discount_percent", "delivery_fee_per_day", "sort_order") VALUES
  ('plan-trial', 'TRIAL', 'Trial', 'Try 3 days of fresh bowls before you commit.', 3, 3, 3, 0, 0, 1),
  ('plan-weekly', 'WEEKLY', 'Weekly', '6 delivery days — a fresh bowl every day, your pick each day.', 6, 6, 6, 5, 0, 2),
  ('plan-monthly', 'MONTHLY', 'Monthly', '24 delivery days — about four weeks of healthy meals.', 24, 24, 24, 10, 0, 3),
  ('plan-custom', 'CUSTOM', 'Pick your days', 'Choose exactly the dates you want, from 2 to 30 days.', NULL, 2, 30, 0, 0, 4)
ON CONFLICT ("code") DO NOTHING;
