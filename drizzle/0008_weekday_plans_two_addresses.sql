ALTER TABLE "subscription_days" ADD COLUMN "address_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "weekdays" text DEFAULT '1,2,3,4,5' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "address_label" text DEFAULT 'Address 1' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "address2" jsonb;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "address2_label" text DEFAULT 'Address 2' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pincode2" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "area_id2" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "address_by_weekday" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_area_id2_delivery_areas_id_fk" FOREIGN KEY ("area_id2") REFERENCES "public"."delivery_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "subscription_plans" SET "days" = 5, "min_days" = 5, "max_days" = 5, "description" = '5 weekdays (Mon–Fri) — a fresh bowl every working day, your pick each day.' WHERE "code" = 'WEEKLY' AND "days" = 6;--> statement-breakpoint
UPDATE "subscription_plans" SET "days" = 20, "min_days" = 20, "max_days" = 20, "description" = '20 weekdays — four working weeks of healthy meals, Mon–Fri.' WHERE "code" = 'MONTHLY' AND "days" = 24;--> statement-breakpoint
UPDATE "subscription_plans" SET "description" = 'Try 3 weekdays of fresh bowls before you commit.' WHERE "code" = 'TRIAL' AND "description" = 'Try 3 days of fresh bowls before you commit.';--> statement-breakpoint
UPDATE "subscription_plans" SET "description" = 'Choose exactly the weekdays you want, from 2 to 30 days.' WHERE "code" = 'CUSTOM' AND "description" = 'Choose exactly the dates you want, from 2 to 30 days.';
