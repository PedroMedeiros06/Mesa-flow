ALTER TABLE "app"."companies" ADD COLUMN "address_cep" text;--> statement-breakpoint
ALTER TABLE "app"."companies" ADD COLUMN "address_street" text;--> statement-breakpoint
ALTER TABLE "app"."companies" ADD COLUMN "address_number" text;--> statement-breakpoint
ALTER TABLE "app"."companies" ADD COLUMN "address_complement" text;--> statement-breakpoint
ALTER TABLE "app"."companies" ADD COLUMN "address_district" text;--> statement-breakpoint
ALTER TABLE "app"."companies" ADD COLUMN "address_city" text;--> statement-breakpoint
ALTER TABLE "app"."companies" ADD COLUMN "address_state" text;--> statement-breakpoint
ALTER TABLE "app"."companies" ADD CONSTRAINT "companies_cep_format" CHECK ("app"."companies"."address_cep" is null or "app"."companies"."address_cep" ~ '^[0-9]{8}$');--> statement-breakpoint
ALTER TABLE "app"."companies" ADD CONSTRAINT "companies_state_format" CHECK ("app"."companies"."address_state" is null or "app"."companies"."address_state" ~ '^[A-Z]{2}$');