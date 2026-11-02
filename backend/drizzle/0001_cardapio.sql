CREATE TABLE "app"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_company_id" UNIQUE("company_id","id")
);
--> statement-breakpoint
ALTER TABLE "app"."categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."product_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_addons_price_range" CHECK ("app"."product_addons"."price_cents" between 0 and 10000000)
);
--> statement-breakpoint
ALTER TABLE "app"."product_addons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"path" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_path_unique" UNIQUE("path")
);
--> statement-breakpoint
ALTER TABLE "app"."product_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_company_id" UNIQUE("company_id","id"),
	CONSTRAINT "products_price_range" CHECK ("app"."products"."price_cents" between 0 and 10000000)
);
--> statement-breakpoint
ALTER TABLE "app"."products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."categories" ADD CONSTRAINT "categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_addons" ADD CONSTRAINT "product_addons_product_fk" FOREIGN KEY ("company_id","product_id") REFERENCES "app"."products"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_images" ADD CONSTRAINT "product_images_product_fk" FOREIGN KEY ("company_id","product_id") REFERENCES "app"."products"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."products" ADD CONSTRAINT "products_category_fk" FOREIGN KEY ("company_id","category_id") REFERENCES "app"."categories"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_company_name" ON "app"."categories" USING btree ("company_id",lower("name"));--> statement-breakpoint
CREATE INDEX "product_addons_product" ON "app"."product_addons" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_images_product" ON "app"."product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_company_category" ON "app"."products" USING btree ("company_id","category_id");