CREATE TABLE "job_runs" (
	"run_key" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"channel" text NOT NULL,
	"recipient" text DEFAULT 'team' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"delivery_confirmed" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_id" text,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"day_id" text,
	"type" text NOT NULL,
	"original_date" text,
	"requested_date" text,
	"reason" text DEFAULT '' NOT NULL,
	"requested_by" text NOT NULL,
	"requested_by_customer" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"outcome" text,
	"final_date" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"end_date_before" text,
	"end_date_after" text,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "daily_list_time" text DEFAULT '20:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "renewal_reminder_days" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "customer_messaging" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_requests" ADD CONSTRAINT "schedule_requests_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_requests" ADD CONSTRAINT "schedule_requests_day_id_subscription_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."subscription_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("dedupe_key","channel");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "schedule_requests_status_idx" ON "schedule_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "schedule_requests_sub_idx" ON "schedule_requests" USING btree ("subscription_id");