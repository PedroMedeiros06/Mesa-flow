CREATE TABLE "app"."table_codes" (
	"company_id" uuid NOT NULL,
	"table_number" integer NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_codes_pk" PRIMARY KEY("company_id","table_number"),
	CONSTRAINT "table_codes_table_range" CHECK ("app"."table_codes"."table_number" between 1 and 999)
);
--> statement-breakpoint
ALTER TABLE "app"."table_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."waiter_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tab_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"answered_by" uuid
);
--> statement-breakpoint
ALTER TABLE "app"."waiter_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."table_codes" ADD CONSTRAINT "table_codes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."waiter_calls" ADD CONSTRAINT "waiter_calls_answered_by_members_id_fk" FOREIGN KEY ("answered_by") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."waiter_calls" ADD CONSTRAINT "waiter_calls_tab_fk" FOREIGN KEY ("company_id","tab_id") REFERENCES "app"."tabs"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "table_codes_token" ON "app"."table_codes" USING btree ("token");--> statement-breakpoint
CREATE INDEX "waiter_calls_tab_created" ON "app"."waiter_calls" USING btree ("tab_id","created_at");--> statement-breakpoint
CREATE INDEX "waiter_calls_pending" ON "app"."waiter_calls" USING btree ("company_id") WHERE "app"."waiter_calls"."answered_at" is null;