CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"kind" text DEFAULT 'INVOICE' NOT NULL,
	"related_invoice_id" text,
	"payment_id" text,
	"customer_id" text,
	"subscription_id" text,
	"order_id" text,
	"issue_date" text NOT NULL,
	"due_date" text,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"delivery_fee" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"tax_label" text DEFAULT 'GST' NOT NULL,
	"tax_percent" real DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"status" text DEFAULT 'ISSUED' NOT NULL,
	"gst_invoice" boolean DEFAULT false NOT NULL,
	"business" jsonb NOT NULL,
	"customer" jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"public_token" text NOT NULL,
	"void_reason" text,
	"created_by" text DEFAULT 'System' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "legal_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "gst_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "gstin" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "business_state" text DEFAULT 'Tamil Nadu' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "invoice_prefix" text DEFAULT 'SS' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "invoice_terms" text DEFAULT 'Thank you for choosing Salad Stories.' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "opening_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_token_idx" ON "invoices" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_sub_live_idx" ON "invoices" USING btree ("subscription_id") WHERE "invoices"."kind" = 'INVOICE' and "invoices"."status" <> 'VOID' and "invoices"."subscription_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_order_live_idx" ON "invoices" USING btree ("order_id") WHERE "invoices"."kind" = 'INVOICE' and "invoices"."status" <> 'VOID' and "invoices"."order_id" is not null and "invoices"."subscription_id" is null;