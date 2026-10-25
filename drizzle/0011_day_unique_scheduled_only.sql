DROP INDEX "subscription_days_sub_date_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_days_sub_date_idx" ON "subscription_days" USING btree ("subscription_id","date") WHERE "subscription_days"."status" = 'SCHEDULED';--> statement-breakpoint
UPDATE "orders" o SET "customer_id" = s."customer_id" FROM "subscriptions" s WHERE o."subscription_id" = s."id" AND o."kind" = 'PLAN_DAY' AND o."customer_id" IS NULL AND s."customer_id" IS NOT NULL;
