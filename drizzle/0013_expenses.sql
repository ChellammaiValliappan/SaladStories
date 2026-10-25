CREATE TABLE "expense_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"date" text NOT NULL,
	"category_id" text,
	"description" text NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"amount" integer NOT NULL,
	"method" text DEFAULT 'UPI' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"attachment_key" text,
	"attachment_name" text,
	"attachment_type" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"data_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_id");--> statement-breakpoint
INSERT INTO "expense_categories" ("id", "name", "sort_order") VALUES
  (gen_random_uuid()::text, 'Vegetables', 1),
  (gen_random_uuid()::text, 'Fruits', 2),
  (gen_random_uuid()::text, 'Protein (paneer, eggs, chicken)', 3),
  (gen_random_uuid()::text, 'Groceries & dressings', 4),
  (gen_random_uuid()::text, 'Packaging', 5),
  (gen_random_uuid()::text, 'Delivery', 6),
  (gen_random_uuid()::text, 'Staff', 7),
  (gen_random_uuid()::text, 'Rent & utilities', 8),
  (gen_random_uuid()::text, 'Equipment', 9),
  (gen_random_uuid()::text, 'Marketing & Meta ads', 10),
  (gen_random_uuid()::text, 'Software & subscriptions', 11),
  (gen_random_uuid()::text, 'Miscellaneous', 12)
ON CONFLICT ("name") DO NOTHING;
