import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgSchema, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { MemberRole } from "@mesaflow/shared";

// O drizzle-kit carrega este arquivo em CommonJS e não enxerga valores do @mesaflow/shared (ESM).
// Por isso os papéis são repetidos aqui, e o tipo abaixo quebra a compilação se divergirem.
const MEMBER_ROLES = ["owner", "employee"] as const;
type _MesmosPapeis = [MemberRole] extends [(typeof MEMBER_ROLES)[number]]
  ? [(typeof MEMBER_ROLES)[number]] extends [MemberRole]
    ? true
    : never
  : never;
const _papeisConferidos: _MesmosPapeis = true;
void _papeisConferidos;

// Tudo do MesaFlow fica no schema "app", que a API pública do Supabase não expõe.
// Só o backend acessa estas tabelas, pela conexão direta. RLS fica ligado sem políticas
// como segunda barreira: se alguém expuser o schema por engano, a API pública não lê nada.
export const app = pgSchema("app");

export const companyStatus = app.enum("company_status", ["active", "blocked"]);
export const memberRole = app.enum("member_role", MEMBER_ROLES);
export const memberStatus = app.enum("member_status", ["active", "blocked"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Usuários do Supabase Auth. Declarado só para as chaves estrangeiras e sem export,
// para o drizzle-kit não tentar criar nem alterar a tabela do Supabase.
const authSchema = pgSchema("auth");
const authUsers = authSchema.table("users", { id: uuid("id").primaryKey() });

export const companies = app
  .table(
    "companies",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      // Código que a equipe digita no login (ex.: "482913").
      code: text("code").notNull().unique(),
      name: text("name").notNull(),
      legalName: text("legal_name"),
      document: text("document"),
      whatsapp: text("whatsapp"),
      status: companyStatus("status").notNull().default("active"),
      blockedReason: text("blocked_reason"),
      ...timestamps,
    },
    (t) => [check("companies_code_format", sql`${t.code} ~ '^[0-9]{6}$'`)],
  )
  .enableRLS();

export const members = app
  .table(
    "members",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id")
        .notNull()
        .references(() => companies.id, { onDelete: "cascade" }),
      authUserId: uuid("auth_user_id")
        .notNull()
        .unique()
        .references(() => authUsers.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      cpf: text("cpf").notNull(),
      email: text("email").notNull(),
      role: memberRole("role").notNull().default("employee"),
      // Chaves de PERMISSIONS (@mesaflow/shared). Validadas no backend antes de gravar.
      permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
      status: memberStatus("status").notNull().default("active"),
      ...timestamps,
    },
    (t) => [
      // Também serve de índice para buscar a equipe por company_id (coluna da esquerda).
      unique("members_company_cpf").on(t.companyId, t.cpf),
      check("members_cpf_format", sql`${t.cpf} ~ '^[0-9]{11}$'`),
    ],
  )
  .enableRLS();

// Equipe MesaFlow (admin da plataforma).
export const platformAdmins = app
  .table("platform_admins", {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: uuid("auth_user_id")
      .notNull()
      .unique()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    ...timestamps,
  })
  .enableRLS();

// ---------- cardápio ----------
// Toda tabela do restaurante carrega company_id. As chaves estrangeiras compostas
// (company_id, x_id) impedem que um produto aponte para a categoria de outro restaurante.

export const categories = app
  .table(
    "categories",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id")
        .notNull()
        .references(() => companies.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      position: integer("position").notNull().default(0),
      active: boolean("active").notNull().default(true),
      ...timestamps,
    },
    (t) => [
      unique("categories_company_id").on(t.companyId, t.id),
      uniqueIndex("categories_company_name").on(t.companyId, sql`lower(${t.name})`),
    ],
  )
  .enableRLS();

export const products = app
  .table(
    "products",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id")
        .notNull()
        .references(() => companies.id, { onDelete: "cascade" }),
      categoryId: uuid("category_id").notNull(),
      name: text("name").notNull(),
      description: text("description").notNull().default(""),
      priceCents: integer("price_cents").notNull(),
      position: integer("position").notNull().default(0),
      active: boolean("active").notNull().default(true),
      ...timestamps,
    },
    (t) => [
      unique("products_company_id").on(t.companyId, t.id),
      // Categoria com produto não pode ser apagada (restrict): o dono move ou apaga os produtos antes.
      foreignKey({
        name: "products_category_fk",
        columns: [t.companyId, t.categoryId],
        foreignColumns: [categories.companyId, categories.id],
      }).onDelete("restrict"),
      index("products_company_category").on(t.companyId, t.categoryId),
      check("products_price_range", sql`${t.priceCents} between 0 and 10000000`),
    ],
  )
  .enableRLS();

export const productAddons = app
  .table(
    "product_addons",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id").notNull(),
      productId: uuid("product_id").notNull(),
      name: text("name").notNull(),
      priceCents: integer("price_cents").notNull(),
      position: integer("position").notNull().default(0),
      active: boolean("active").notNull().default(true),
      ...timestamps,
    },
    (t) => [
      foreignKey({
        name: "product_addons_product_fk",
        columns: [t.companyId, t.productId],
        foreignColumns: [products.companyId, products.id],
      }).onDelete("cascade"),
      index("product_addons_product").on(t.productId),
      check("product_addons_price_range", sql`${t.priceCents} between 0 and 10000000`),
    ],
  )
  .enableRLS();

// Fotos no Supabase Storage (bucket "cardapio"). Aqui fica só o caminho do arquivo.
export const productImages = app
  .table(
    "product_images",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id").notNull(),
      productId: uuid("product_id").notNull(),
      path: text("path").notNull().unique(),
      position: integer("position").notNull().default(0),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      foreignKey({
        name: "product_images_product_fk",
        columns: [t.companyId, t.productId],
        foreignColumns: [products.companyId, products.id],
      }).onDelete("cascade"),
      index("product_images_product").on(t.productId),
    ],
  )
  .enableRLS();
