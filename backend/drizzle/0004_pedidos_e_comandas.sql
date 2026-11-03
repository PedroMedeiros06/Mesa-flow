CREATE TYPE "app"."order_origin" AS ENUM('balcao', 'vitrine', 'mesa');--> statement-breakpoint
CREATE TYPE "app"."order_status" AS ENUM('novo', 'preparo', 'pronto', 'entregue', 'cancelado');--> statement-breakpoint
CREATE TYPE "app"."payment_method" AS ENUM('dinheiro', 'pix', 'credito', 'debito');--> statement-breakpoint
CREATE TYPE "app"."tab_status" AS ENUM('aberta', 'fechada', 'juntada');--> statement-breakpoint
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
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
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
	"customer_phone" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"payment_method" "app"."payment_method",
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"received_cents" integer,
	"change_cents" integer DEFAULT 0 NOT NULL,
	"client_request_id" uuid NOT NULL,
	"tab_id" uuid,
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
CREATE TABLE "app"."tab_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tab_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."tab_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."tab_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tab_id" uuid NOT NULL,
	"method" "app"."payment_method" NOT NULL,
	"amount_cents" integer NOT NULL,
	"received_cents" integer,
	"change_cents" integer DEFAULT 0 NOT NULL,
	"payer_label" text DEFAULT '' NOT NULL,
	"client_request_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "tab_payments_company_request" UNIQUE("company_id","client_request_id"),
	CONSTRAINT "tab_payments_amount" CHECK ("app"."tab_payments"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."tab_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."tabs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"label" text NOT NULL,
	"table_number" integer,
	"status" "app"."tab_status" DEFAULT 'aberta' NOT NULL,
	"service_fee_bps" integer NOT NULL,
	"merged_into_id" uuid,
	"opened_by" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"closed_subtotal_cents" integer,
	"closed_service_fee_cents" integer,
	"closed_total_cents" integer,
	CONSTRAINT "tabs_company_id" UNIQUE("company_id","id"),
	CONSTRAINT "tabs_fee_range" CHECK ("app"."tabs"."service_fee_bps" between 0 and 2000),
	CONSTRAINT "tabs_table_range" CHECK ("app"."tabs"."table_number" is null or "app"."tabs"."table_number" between 1 and 999)
);
--> statement-breakpoint
ALTER TABLE "app"."tabs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."products" ADD COLUMN "promo_price_cents" integer;--> statement-breakpoint
ALTER TABLE "app"."order_counters" ADD CONSTRAINT "order_counters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_cancelled_by_members_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_order_fk" FOREIGN KEY ("company_id","order_id") REFERENCES "app"."orders"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_cancelled_by_members_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_tab_fk" FOREIGN KEY ("company_id","tab_id") REFERENCES "app"."tabs"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tab_events" ADD CONSTRAINT "tab_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tab_events" ADD CONSTRAINT "tab_events_tab_fk" FOREIGN KEY ("company_id","tab_id") REFERENCES "app"."tabs"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tab_payments" ADD CONSTRAINT "tab_payments_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tab_payments" ADD CONSTRAINT "tab_payments_voided_by_members_id_fk" FOREIGN KEY ("voided_by") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tab_payments" ADD CONSTRAINT "tab_payments_tab_fk" FOREIGN KEY ("company_id","tab_id") REFERENCES "app"."tabs"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tabs" ADD CONSTRAINT "tabs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tabs" ADD CONSTRAINT "tabs_opened_by_members_id_fk" FOREIGN KEY ("opened_by") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tabs" ADD CONSTRAINT "tabs_closed_by_members_id_fk" FOREIGN KEY ("closed_by") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order" ON "app"."order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product" ON "app"."order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_company_status" ON "app"."orders" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "orders_company_created" ON "app"."orders" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_tab" ON "app"."orders" USING btree ("tab_id");--> statement-breakpoint
CREATE INDEX "tab_events_tab_created" ON "app"."tab_events" USING btree ("tab_id","created_at");--> statement-breakpoint
CREATE INDEX "tab_payments_tab" ON "app"."tab_payments" USING btree ("tab_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tabs_open_table" ON "app"."tabs" USING btree ("company_id","table_number") WHERE "app"."tabs"."status" = 'aberta' and "app"."tabs"."table_number" is not null;--> statement-breakpoint
CREATE INDEX "tabs_company_status" ON "app"."tabs" USING btree ("company_id","status");--> statement-breakpoint
ALTER TABLE "app"."products" ADD CONSTRAINT "products_promo_below_price" CHECK ("app"."products"."promo_price_cents" is null or "app"."products"."promo_price_cents" between 0 and "app"."products"."price_cents" - 1);