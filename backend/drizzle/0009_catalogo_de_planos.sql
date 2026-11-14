CREATE TABLE "app"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"highlighted" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_price" CHECK ("app"."plans"."price_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."subscriptions" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_name" ON "app"."plans" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "app"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Os dois planos que o site mostrava fixos no código viram os primeiros planos do catálogo.
INSERT INTO "app"."plans" ("name", "price_cents", "description", "features", "highlighted", "position") VALUES
  ('Essencial', 4990, 'Para quem vende no balcão e pelo cardápio online.', ARRAY['Balcão, cozinha e vitrine', 'Cardápio com fotos e adicionais', 'Até 3 pessoas na equipe'], false, 1),
  ('Completo', 9990, 'Para restaurante com salão, mesas e estoque.', ARRAY['Tudo do Essencial', 'Mesas e comandas com divisão da conta', 'Estoque com ficha técnica', 'Equipe sem limite'], true, 2);--> statement-breakpoint
-- Assinaturas que já existem ficam ligadas ao plano de mesmo nome (o preço de cada uma não muda).
UPDATE "app"."subscriptions" s SET "plan_id" = p."id" FROM "app"."plans" p WHERE lower(s."plan") = lower(p."name");
