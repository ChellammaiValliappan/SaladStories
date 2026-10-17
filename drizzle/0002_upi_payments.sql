ALTER TABLE "orders" ADD COLUMN "upi_ref" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "payment_mode" text DEFAULT 'UPI' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "upi_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "upi_name" text DEFAULT 'Salad Stories' NOT NULL;