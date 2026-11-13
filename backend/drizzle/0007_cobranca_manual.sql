CREATE TYPE "app"."invoice_status" AS ENUM('pending', 'paid', 'canceled');--> statement-breakpoint
CREATE TABLE "app"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"reference" date NOT NULL,
	"plan" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_date" date NOT NULL,
	"status" "app"."invoice_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"payment_method" text,
	"note" text DEFAULT '' NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_company_reference" UNIQUE("company_id","reference"),
	CONSTRAINT "invoices_amount" CHECK ("app"."invoices"."amount_cents" > 0),
	CONSTRAINT "invoices_reference_day" CHECK (extract(day from "app"."invoices"."reference") = 1)
);
--> statement-breakpoint
ALTER TABLE "app"."invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."subscriptions" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"price_cents" integer NOT NULL,
	"due_day" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_price" CHECK ("app"."subscriptions"."price_cents" > 0),
	CONSTRAINT "subscriptions_due_day" CHECK ("app"."subscriptions"."due_day" between 1 and 28)
);
--> statement-breakpoint
ALTER TABLE "app"."subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_changed_by_platform_admins_id_fk" FOREIGN KEY ("changed_by") REFERENCES "app"."platform_admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_status_due" ON "app"."invoices" USING btree ("status","due_date");