CREATE TYPE "app"."ingredient_unit" AS ENUM('un', 'kg', 'g', 'l', 'ml');--> statement-breakpoint
CREATE TYPE "app"."stock_movement_kind" AS ENUM('entrada', 'perda', 'contagem', 'venda', 'estorno');--> statement-breakpoint
CREATE TABLE "app"."ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" "app"."ingredient_unit" NOT NULL,
	"stock_milli" integer DEFAULT 0 NOT NULL,
	"min_stock_milli" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_company_id" UNIQUE("company_id","id")
);
--> statement-breakpoint
ALTER TABLE "app"."ingredients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."product_ingredients" (
	"company_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity_milli" integer NOT NULL,
	"removable" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_ingredients_pk" PRIMARY KEY("product_id","ingredient_id"),
	CONSTRAINT "product_ingredients_quantity" CHECK ("app"."product_ingredients"."quantity_milli" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."product_ingredients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"kind" "app"."stock_movement_kind" NOT NULL,
	"delta_milli" integer NOT NULL,
	"balance_after_milli" integer NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."ingredients" ADD CONSTRAINT "ingredients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_ingredients" ADD CONSTRAINT "product_ingredients_product_fk" FOREIGN KEY ("company_id","product_id") REFERENCES "app"."products"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_ingredients" ADD CONSTRAINT "product_ingredients_ingredient_fk" FOREIGN KEY ("company_id","ingredient_id") REFERENCES "app"."ingredients"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_ingredient_fk" FOREIGN KEY ("company_id","ingredient_id") REFERENCES "app"."ingredients"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_company_name" ON "app"."ingredients" USING btree ("company_id",lower("name"));--> statement-breakpoint
CREATE INDEX "product_ingredients_ingredient" ON "app"."product_ingredients" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "stock_movements_ingredient_created" ON "app"."stock_movements" USING btree ("ingredient_id","created_at");