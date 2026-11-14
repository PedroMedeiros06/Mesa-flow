CREATE TABLE "app"."addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"resource" text NOT NULL,
	"amount" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addons_resource" CHECK ("app"."addons"."resource" in ('tables', 'members', 'products')),
	CONSTRAINT "addons_amount" CHECK ("app"."addons"."amount" > 0),
	CONSTRAINT "addons_price" CHECK ("app"."addons"."price_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."addons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."subscription_addons" (
	"company_id" uuid NOT NULL,
	"addon_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_addons_pk" PRIMARY KEY("company_id","addon_id"),
	CONSTRAINT "subscription_addons_quantity" CHECK ("app"."subscription_addons"."quantity" between 1 and 99),
	CONSTRAINT "subscription_addons_price" CHECK ("app"."subscription_addons"."unit_price_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."subscription_addons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD COLUMN "items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "max_tables" integer;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "max_members" integer;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "max_products" integer;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "feature_tabs" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "feature_stock" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "feature_storefront" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."subscription_addons" ADD CONSTRAINT "subscription_addons_company_id_subscriptions_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."subscriptions"("company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."subscription_addons" ADD CONSTRAINT "subscription_addons_addon_id_addons_id_fk" FOREIGN KEY ("addon_id") REFERENCES "app"."addons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "addons_name" ON "app"."addons" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "app"."plans" ADD CONSTRAINT "plans_limits" CHECK (coalesce("app"."plans"."max_tables", 1) between 1 and 999 and coalesce("app"."plans"."max_members", 1) >= 1 and coalesce("app"."plans"."max_products", 1) >= 1);--> statement-breakpoint
-- Limites ditos pelo dono: Essencial com 10 mesas e 3 pessoas. O Completo fica sem limite até ele definir.
UPDATE "app"."plans" SET "max_tables" = 10, "max_members" = 3 WHERE lower("name") = 'essencial';--> statement-breakpoint
-- Primeiro produto à parte, do exemplo do dono: +10 mesas por R$ 30,00 por mês.
INSERT INTO "app"."addons" ("name", "resource", "amount", "price_cents", "position") VALUES ('+10 mesas', 'tables', 10, 3000, 1);
