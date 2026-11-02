CREATE TYPE "app"."order_origin" AS ENUM('balcao', 'vitrine', 'mesa');--> statement-breakpoint
CREATE TYPE "app"."order_status" AS ENUM('novo', 'preparo', 'pronto', 'entregue', 'cancelado');--> statement-breakpoint
CREATE TYPE "app"."payment_method" AS ENUM('dinheiro', 'pix', 'credito', 'debito');--> statement-breakpoint
CREATE TABLE "app"."order_counters" (
	"company_id" uuid NOT NULL,
	"day" date NOT NULL,
	"last" integer NOT NULL,
	CONSTRAINT "order_counters_pk" PRIMARY KEY("company_id","day")
);
--> statement-breakpoint
ALTER TABLE "app"."order_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"addons" jsonb NOT NULL,
	"removed" jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"total_cents" integer NOT NULL,
	"consumption" jsonb NOT NULL,
	CONSTRAINT "order_items_quantity" CHECK ("app"."order_items"."quantity" between 1 and 99)
);
--> statement-breakpoint
ALTER TABLE "app"."order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"day" date NOT NULL,
	"number" integer NOT NULL,
	"origin" "app"."order_origin" NOT NULL,
	"status" "app"."order_status" DEFAULT 'novo' NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"payment_method" "app"."payment_method",
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"received_cents" integer,
	"change_cents" integer DEFAULT 0 NOT NULL,
	"client_request_id" uuid NOT NULL,
	"created_by" uuid,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_company_id" UNIQUE("company_id","id"),
	CONSTRAINT "orders_company_request" UNIQUE("company_id","client_request_id"),
	CONSTRAINT "orders_company_day_number" UNIQUE("company_id","day","number"),
	CONSTRAINT "orders_totals" CHECK ("app"."orders"."subtotal_cents" >= 0 and "app"."orders"."discount_cents" between 0 and "app"."orders"."subtotal_cents" and "app"."orders"."total_cents" = "app"."orders"."subtotal_cents" - "app"."orders"."discount_cents")
);
--> statement-breakpoint
ALTER TABLE "app"."orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."products" ADD COLUMN "promo_price_cents" integer;--> statement-breakpoint
ALTER TABLE "app"."order_counters" ADD CONSTRAINT "order_counters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_order_fk" FOREIGN KEY ("company_id","order_id") REFERENCES "app"."orders"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_cancelled_by_members_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order" ON "app"."order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product" ON "app"."order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_company_status" ON "app"."orders" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "orders_company_created" ON "app"."orders" USING btree ("company_id","created_at");--> statement-breakpoint
ALTER TABLE "app"."products" ADD CONSTRAINT "products_promo_below_price" CHECK ("app"."products"."promo_price_cents" is null or "app"."products"."promo_price_cents" between 0 and "app"."products"."price_cents" - 1);