CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."company_status" AS ENUM('active', 'blocked');--> statement-breakpoint
CREATE TYPE "app"."member_role" AS ENUM('owner', 'employee');--> statement-breakpoint
CREATE TYPE "app"."member_status" AS ENUM('active', 'blocked');--> statement-breakpoint
CREATE TABLE "app"."companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"document" text,
	"whatsapp" text,
	"status" "app"."company_status" DEFAULT 'active' NOT NULL,
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_code_unique" UNIQUE("code"),
	CONSTRAINT "companies_code_format" CHECK ("app"."companies"."code" ~ '^[0-9]{6}$')
);
--> statement-breakpoint
ALTER TABLE "app"."companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"cpf" text NOT NULL,
	"email" text NOT NULL,
	"role" "app"."member_role" DEFAULT 'employee' NOT NULL,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "app"."member_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "members_company_cpf" UNIQUE("company_id","cpf"),
	CONSTRAINT "members_cpf_format" CHECK ("app"."members"."cpf" ~ '^[0-9]{11}$')
);
--> statement-breakpoint
ALTER TABLE "app"."members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
ALTER TABLE "app"."platform_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."members" ADD CONSTRAINT "members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."members" ADD CONSTRAINT "members_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."platform_admins" ADD CONSTRAINT "platform_admins_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;