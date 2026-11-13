import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  date,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { MemberRole, MovementKind, OrderOrigin, OrderStatus, PaymentMethod, TabStatus, Unit } from "@mesaflow/shared";

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

// Mesma ideia para unidades e tipos de movimento do estoque.
const UNITS = ["un", "kg", "g", "l", "ml"] as const;
const MOVEMENT_KINDS = ["entrada", "perda", "contagem", "venda", "estorno"] as const;
type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _unidadesConferidas: Igual<Unit, (typeof UNITS)[number]> = true;
const _movimentosConferidos: Igual<MovementKind, (typeof MOVEMENT_KINDS)[number]> = true;
void _unidadesConferidas;
void _movimentosConferidos;

const ORDER_STATUSES = ["novo", "preparo", "pronto", "entregue", "cancelado"] as const;
const ORDER_ORIGINS = ["balcao", "vitrine", "mesa"] as const;
const PAYMENT_METHODS = ["dinheiro", "pix", "credito", "debito"] as const;
const TAB_STATUSES = ["aberta", "fechada", "juntada"] as const;
const _statusConferidos: Igual<OrderStatus, (typeof ORDER_STATUSES)[number]> = true;
const _origensConferidas: Igual<OrderOrigin, (typeof ORDER_ORIGINS)[number]> = true;
const _pagamentosConferidos: Igual<PaymentMethod, (typeof PAYMENT_METHODS)[number]> = true;
void _statusConferidos;
void _origensConferidas;
void _pagamentosConferidos;
const _comandasConferidas: Igual<TabStatus, (typeof TAB_STATUSES)[number]> = true;
void _comandasConferidas;

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
      // Taxa de serviço com que toda mesa abre (pontos-base: 1000 = 10%). Cada mesa ainda pode mudar a sua.
      serviceFeeBps: integer("service_fee_bps").notNull().default(1000),
      status: companyStatus("status").notNull().default("active"),
      blockedReason: text("blocked_reason"),
      ...timestamps,
    },
    (t) => [
      check("companies_code_format", sql`${t.code} ~ '^[0-9]{6}$'`),
      check("companies_fee_range", sql`${t.serviceFeeBps} between 0 and 2000`),
    ],
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
      promoPriceCents: integer("promo_price_cents"),
      position: integer("position").notNull().default(0),
      active: boolean("active").notNull().default(true),
      ...timestamps,
    },
    (t) => [
      check("products_promo_below_price", sql`${t.promoPriceCents} is null or ${t.promoPriceCents} between 0 and ${t.priceCents} - 1`),
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

// ---------- estoque ----------
// Quantidades em milésimos da unidade do ingrediente (inteiro): 0,25 kg = 250.

export const ingredientUnit = app.enum("ingredient_unit", UNITS);
export const movementKind = app.enum("stock_movement_kind", MOVEMENT_KINDS);

export const ingredients = app
  .table(
    "ingredients",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id")
        .notNull()
        .references(() => companies.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      unit: ingredientUnit("unit").notNull(),
      // Nunca negativo: venda ou perda sem saldo é recusada (o banco garante com o CHECK).
      stockMilli: integer("stock_milli").notNull().default(0),
      minStockMilli: integer("min_stock_milli"),
      ...timestamps,
    },
    (t) => [
      unique("ingredients_company_id").on(t.companyId, t.id),
      check("ingredients_stock_non_negative", sql`${t.stockMilli} >= 0`),
      uniqueIndex("ingredients_company_name").on(t.companyId, sql`lower(${t.name})`),
    ],
  )
  .enableRLS();

// Ficha técnica: quanto de cada ingrediente sai a cada unidade vendida do produto.
export const productIngredients = app
  .table(
    "product_ingredients",
    {
      companyId: uuid("company_id").notNull(),
      productId: uuid("product_id").notNull(),
      ingredientId: uuid("ingredient_id").notNull(),
      quantityMilli: integer("quantity_milli").notNull(),
      removable: boolean("removable").notNull().default(false),
      position: integer("position").notNull().default(0),
    },
    (t) => [
      primaryKey({ name: "product_ingredients_pk", columns: [t.productId, t.ingredientId] }),
      foreignKey({
        name: "product_ingredients_product_fk",
        columns: [t.companyId, t.productId],
        foreignColumns: [products.companyId, products.id],
      }).onDelete("cascade"),
      // Ingrediente usado em ficha técnica não pode ser apagado.
      foreignKey({
        name: "product_ingredients_ingredient_fk",
        columns: [t.companyId, t.ingredientId],
        foreignColumns: [ingredients.companyId, ingredients.id],
      }).onDelete("restrict"),
      index("product_ingredients_ingredient").on(t.ingredientId),
      check("product_ingredients_quantity", sql`${t.quantityMilli} > 0`),
    ],
  )
  .enableRLS();

// Histórico de tudo que entrou e saiu. Só recebe inserções.
export const stockMovements = app
  .table(
    "stock_movements",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id").notNull(),
      ingredientId: uuid("ingredient_id").notNull(),
      kind: movementKind("kind").notNull(),
      deltaMilli: integer("delta_milli").notNull(),
      balanceAfterMilli: integer("balance_after_milli").notNull(),
      reason: text("reason").notNull().default(""),
      memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      foreignKey({
        name: "stock_movements_ingredient_fk",
        columns: [t.companyId, t.ingredientId],
        foreignColumns: [ingredients.companyId, ingredients.id],
      }).onDelete("cascade"),
      index("stock_movements_ingredient_created").on(t.ingredientId, t.createdAt),
    ],
  )
  .enableRLS();

// ---------- pedidos ----------

export const orderStatus = app.enum("order_status", ORDER_STATUSES);
export const orderOrigin = app.enum("order_origin", ORDER_ORIGINS);
export const paymentMethod = app.enum("payment_method", PAYMENT_METHODS);

/** Consumo de estoque congelado na venda: o estorno devolve exatamente isto. */
export type ConsumoGuardado = { ingredientId: string; quantityMilli: number }[];

// Número do pedido por restaurante e por dia (fuso de São Paulo): a cozinha chama "pedido 12".
// Incrementado na mesma transação do pedido; se o pedido falhar, o número volta.
export const orderCounters = app
  .table(
    "order_counters",
    {
      companyId: uuid("company_id")
        .notNull()
        .references(() => companies.id, { onDelete: "cascade" }),
      day: date("day").notNull(),
      last: integer("last").notNull(),
    },
    (t) => [primaryKey({ name: "order_counters_pk", columns: [t.companyId, t.day] })],
  )
  .enableRLS();

export const tabStatus = app.enum("tab_status", TAB_STATUSES);

// Comanda de mesa (ou de balcão com nome). O total é calculado das rodadas; ao fechar, fica congelado.
export const tabs = app
  .table(
    "tabs",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id")
        .notNull()
        .references(() => companies.id, { onDelete: "cascade" }),
      label: text("label").notNull(),
      tableNumber: integer("table_number"),
      status: tabStatus("status").notNull().default("aberta"),
      // Cópia da taxa na abertura (pontos-base: 1000 = 10%). Pode ser tirada ao fechar.
      serviceFeeBps: integer("service_fee_bps").notNull(),
      mergedIntoId: uuid("merged_into_id"),
      openedBy: uuid("opened_by").references(() => members.id, { onDelete: "set null" }),
      openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
      closedBy: uuid("closed_by").references(() => members.id, { onDelete: "set null" }),
      closedAt: timestamp("closed_at", { withTimezone: true }),
      closedSubtotalCents: integer("closed_subtotal_cents"),
      closedServiceFeeCents: integer("closed_service_fee_cents"),
      closedTotalCents: integer("closed_total_cents"),
    },
    (t) => [
      unique("tabs_company_id").on(t.companyId, t.id),
      // Uma comanda aberta por mesa.
      uniqueIndex("tabs_open_table")
        .on(t.companyId, t.tableNumber)
        .where(sql`${t.status} = 'aberta' and ${t.tableNumber} is not null`),
      index("tabs_company_status").on(t.companyId, t.status),
      check("tabs_fee_range", sql`${t.serviceFeeBps} between 0 and 2000`),
      check("tabs_table_range", sql`${t.tableNumber} is null or ${t.tableNumber} between 1 and 999`),
    ],
  )
  .enableRLS();

export const orders = app
  .table(
    "orders",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id")
        .notNull()
        .references(() => companies.id, { onDelete: "cascade" }),
      day: date("day").notNull(),
      number: integer("number").notNull(),
      origin: orderOrigin("origin").notNull(),
      status: orderStatus("status").notNull().default("novo"),
      customerName: text("customer_name").notNull().default(""),
      // Só dígitos, com DDD. Vem da vitrine, para o restaurante falar com o cliente.
      customerPhone: text("customer_phone").notNull().default(""),
      notes: text("notes").notNull().default(""),
      paymentMethod: paymentMethod("payment_method"),
      subtotalCents: integer("subtotal_cents").notNull(),
      discountCents: integer("discount_cents").notNull().default(0),
      totalCents: integer("total_cents").notNull(),
      receivedCents: integer("received_cents"),
      changeCents: integer("change_cents").notNull().default(0),
      clientRequestId: uuid("client_request_id").notNull(),
      // Rodada de mesa: a comanda dona do pedido.
      tabId: uuid("tab_id"),
      createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
      statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
      cancelledBy: uuid("cancelled_by").references(() => members.id, { onDelete: "set null" }),
      cancelReason: text("cancel_reason"),
      ...timestamps,
    },
    (t) => [
      unique("orders_company_id").on(t.companyId, t.id),
      unique("orders_company_request").on(t.companyId, t.clientRequestId),
      unique("orders_company_day_number").on(t.companyId, t.day, t.number),
      index("orders_company_status").on(t.companyId, t.status),
      index("orders_company_created").on(t.companyId, t.createdAt),
      index("orders_tab").on(t.tabId),
      foreignKey({
        name: "orders_tab_fk",
        columns: [t.companyId, t.tabId],
        foreignColumns: [tabs.companyId, tabs.id],
      }).onDelete("restrict"),
      check("orders_totals", sql`${t.subtotalCents} >= 0 and ${t.discountCents} between 0 and ${t.subtotalCents} and ${t.totalCents} = ${t.subtotalCents} - ${t.discountCents}`),
    ],
  )
  .enableRLS();

// Itens com tudo copiado no momento da venda (nome, preço, adicionais): o histórico não muda
// se o cardápio mudar. O produto pode ser apagado depois; aí product_id vira null.
export const orderItems = app
  .table(
    "order_items",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id").notNull(),
      orderId: uuid("order_id").notNull(),
      productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
      position: integer("position").notNull(),
      name: text("name").notNull(),
      quantity: integer("quantity").notNull(),
      unitPriceCents: integer("unit_price_cents").notNull(),
      addons: jsonb("addons").$type<{ name: string; priceCents: number }[]>().notNull(),
      removed: jsonb("removed").$type<string[]>().notNull(),
      notes: text("notes").notNull().default(""),
      totalCents: integer("total_cents").notNull(),
      consumption: jsonb("consumption").$type<ConsumoGuardado>().notNull(),
      // Item tirado da conta da mesa. O estoque volta se a rodada ainda não tinha sido entregue.
      cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
      cancelledBy: uuid("cancelled_by").references(() => members.id, { onDelete: "set null" }),
      cancelReason: text("cancel_reason"),
    },
    (t) => [
      foreignKey({
        name: "order_items_order_fk",
        columns: [t.companyId, t.orderId],
        foreignColumns: [orders.companyId, orders.id],
      }).onDelete("cascade"),
      index("order_items_order").on(t.orderId),
      index("order_items_product").on(t.productId),
      check("order_items_quantity", sql`${t.quantity} between 1 and 99`),
    ],
  )
  .enableRLS();

// Pagamentos parciais da comanda. Estorno marca, não apaga.
export const tabPayments = app
  .table(
    "tab_payments",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id").notNull(),
      tabId: uuid("tab_id").notNull(),
      method: paymentMethod("method").notNull(),
      amountCents: integer("amount_cents").notNull(),
      receivedCents: integer("received_cents"),
      changeCents: integer("change_cents").notNull().default(0),
      payerLabel: text("payer_label").notNull().default(""),
      clientRequestId: uuid("client_request_id").notNull(),
      createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      voidedAt: timestamp("voided_at", { withTimezone: true }),
      voidedBy: uuid("voided_by").references(() => members.id, { onDelete: "set null" }),
      voidReason: text("void_reason"),
    },
    (t) => [
      foreignKey({
        name: "tab_payments_tab_fk",
        columns: [t.companyId, t.tabId],
        foreignColumns: [tabs.companyId, tabs.id],
      }).onDelete("cascade"),
      unique("tab_payments_company_request").on(t.companyId, t.clientRequestId),
      index("tab_payments_tab").on(t.tabId),
      check("tab_payments_amount", sql`${t.amountCents} > 0`),
    ],
  )
  .enableRLS();

// Tudo que aconteceu na comanda, só inserções: quem abriu, lançou, cancelou, transferiu, pagou, fechou.
export const tabEvents = app
  .table(
    "tab_events",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id").notNull(),
      tabId: uuid("tab_id").notNull(),
      kind: text("kind").notNull(),
      description: text("description").notNull(),
      memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      foreignKey({
        name: "tab_events_tab_fk",
        columns: [t.companyId, t.tabId],
        foreignColumns: [tabs.companyId, tabs.id],
      }).onDelete("cascade"),
      index("tab_events_tab_created").on(t.tabId, t.createdAt),
    ],
  )
  .enableRLS();

// QR fixo de cada mesa. O token vai no QR; trocar o token invalida o adesivo antigo.
// O QR aponta para a mesa, não para a comanda: mostra a comanda aberta naquele momento.
export const tableCodes = app
  .table(
    "table_codes",
    {
      companyId: uuid("company_id")
        .notNull()
        .references(() => companies.id, { onDelete: "cascade" }),
      tableNumber: integer("table_number").notNull(),
      token: text("token").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      primaryKey({ name: "table_codes_pk", columns: [t.companyId, t.tableNumber] }),
      uniqueIndex("table_codes_token").on(t.token),
      check("table_codes_table_range", sql`${t.tableNumber} between 1 and 999`),
    ],
  )
  .enableRLS();

// Cliente chamou o garçom pelo QR. Fica aberto até alguém da equipe marcar como atendido.
export const waiterCalls = app
  .table(
    "waiter_calls",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id").notNull(),
      tabId: uuid("tab_id").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      answeredAt: timestamp("answered_at", { withTimezone: true }),
      answeredBy: uuid("answered_by").references(() => members.id, { onDelete: "set null" }),
    },
    (t) => [
      foreignKey({
        name: "waiter_calls_tab_fk",
        columns: [t.companyId, t.tabId],
        foreignColumns: [tabs.companyId, tabs.id],
      }).onDelete("cascade"),
      index("waiter_calls_tab_created").on(t.tabId, t.createdAt),
      index("waiter_calls_pending").on(t.companyId).where(sql`${t.answeredAt} is null`),
    ],
  )
  .enableRLS();

// ---------- cobrança manual (equipe MesaFlow) ----------

export const invoiceStatus = app.enum("invoice_status", ["pending", "paid", "canceled"]);

// Plano de cada restaurante. Nome e preço ficam aqui (texto e centavos), porque a tabela de preços
// ainda vai mudar: trocar o nome de um plano não exige migração.
export const subscriptions = app
  .table(
    "subscriptions",
    {
      companyId: uuid("company_id")
        .primaryKey()
        .references(() => companies.id, { onDelete: "cascade" }),
      plan: text("plan").notNull(),
      priceCents: integer("price_cents").notNull(),
      // Dia do vencimento: até 28 para existir em todo mês.
      dueDay: integer("due_day").notNull(),
      ...timestamps,
    },
    (t) => [
      check("subscriptions_price", sql`${t.priceCents} > 0`),
      check("subscriptions_due_day", sql`${t.dueDay} between 1 and 28`),
    ],
  )
  .enableRLS();

// Fatura do mês. Nunca é apagada: cancelar e desfazer só mudam o status.
export const invoices = app
  .table(
    "invoices",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      companyId: uuid("company_id")
        .notNull()
        .references(() => companies.id, { onDelete: "cascade" }),
      // Primeiro dia do mês de referência.
      reference: date("reference").notNull(),
      plan: text("plan").notNull(),
      amountCents: integer("amount_cents").notNull(),
      dueDate: date("due_date").notNull(),
      status: invoiceStatus("status").notNull().default("pending"),
      paidAt: timestamp("paid_at", { withTimezone: true }),
      paymentMethod: text("payment_method"),
      note: text("note").notNull().default(""),
      changedBy: uuid("changed_by").references(() => platformAdmins.id, { onDelete: "set null" }),
      ...timestamps,
    },
    (t) => [
      unique("invoices_company_reference").on(t.companyId, t.reference),
      index("invoices_status_due").on(t.status, t.dueDate),
      check("invoices_amount", sql`${t.amountCents} > 0`),
      check("invoices_reference_day", sql`extract(day from ${t.reference}) = 1`),
    ],
  )
  .enableRLS();
