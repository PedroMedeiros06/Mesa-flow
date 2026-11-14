import { z } from "zod";

/** O que um limite conta. Mesas = número da mesa mais alto que dá para usar; pessoas inclui o dono. */
export const PLAN_RESOURCES = ["tables", "members", "products"] as const;
export type PlanResource = (typeof PLAN_RESOURCES)[number];
export const PLAN_RESOURCE_LABELS: Record<PlanResource, { singular: string; plural: string }> = {
  tables: { singular: "mesa", plural: "mesas" },
  members: { singular: "pessoa na equipe", plural: "pessoas na equipe" },
  products: { singular: "produto no cardápio", plural: "produtos no cardápio" },
};

/** Recursos que o plano liga ou desliga ("modules", para não confundir com os itens de texto "features"). */
export const PLAN_MODULES = ["tabs", "stock", "storefront"] as const;
export type PlanModule = (typeof PLAN_MODULES)[number];
export const PLAN_MODULE_LABELS: Record<PlanModule, string> = {
  tabs: "Mesas e comandas (com QR da mesa)",
  stock: "Estoque com ficha técnica",
  storefront: "Cardápio online",
};

/** null = sem limite. */
export const planLimitsSchema = z.object({
  tables: z.number().int().nullable(),
  members: z.number().int().nullable(),
  products: z.number().int().nullable(),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const planModulesSchema = z.object({ tabs: z.boolean(), stock: z.boolean(), storefront: z.boolean() });
export type PlanModules = z.infer<typeof planModulesSchema>;

/** Sem plano: sem limite e com tudo liberado. */
export const SEM_LIMITES: PlanLimits = { tables: null, members: null, products: null };
export const TUDO_LIBERADO: PlanModules = { tabs: true, stock: true, storefront: true };

/** Plano como aparece no site (só os ativos, na ordem escolhida). */
export const publicPlanSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceCents: z.number().int(),
  description: z.string(),
  features: z.array(z.string()),
  highlighted: z.boolean(),
  limits: planLimitsSchema,
  modules: planModulesSchema,
});
export type PublicPlan = z.infer<typeof publicPlanSchema>;

/** Plano no admin: inclui os inativos e quantos restaurantes estão nele. */
export const adminPlanSchema = publicPlanSchema.extend({
  active: z.boolean(),
  position: z.number().int(),
  subscribers: z.number().int(),
  /** Restaurantes do plano pagando valor diferente do valor atual do plano. */
  subscribersWithOtherPrice: z.number().int(),
});
export type AdminPlan = z.infer<typeof adminPlanSchema>;

export const planInputSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do plano").max(40, "Nome muito longo"),
  priceCents: z.number({ error: "Informe o valor" }).int().min(1, "Informe o valor").max(10_000_000),
  description: z.string().trim().max(200, "Use no máximo 200 caracteres").default(""),
  features: z
    .array(z.string().trim().min(1).max(80, "Cada item com no máximo 80 caracteres"))
    .max(12, "No máximo 12 itens")
    .default([]),
  highlighted: z.boolean().default(false),
  active: z.boolean().default(true),
  limits: z
    .object({
      tables: z.number().int().min(1, "No mínimo 1").max(999, "No máximo 999").nullable(),
      members: z.number().int().min(1, "No mínimo 1").max(9999).nullable(),
      products: z.number().int().min(1, "No mínimo 1").max(99999).nullable(),
    })
    .default(SEM_LIMITES),
  modules: planModulesSchema.default(TUDO_LIBERADO),
  /**
   * Só ao mudar o valor: true leva o valor novo para todos os restaurantes do plano (próximas
   * faturas); false deixa quem já é cliente no valor antigo.
   */
  applyPriceToSubscribers: z.boolean().default(false),
});
export type PlanInput = z.input<typeof planInputSchema>;

export const planSavedSchema = z.object({ plan: adminPlanSchema, updatedSubscriptions: z.number().int() });
export type PlanSaved = z.infer<typeof planSavedSchema>;

export const planOrderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(50) });

// ---------- produtos à parte (adicionais) ----------

export const publicPlanAddonSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  resource: z.enum(PLAN_RESOURCES),
  /** Quanto cada pacote aumenta. */
  amount: z.number().int(),
  priceCents: z.number().int(),
});
export type PublicPlanAddon = z.infer<typeof publicPlanAddonSchema>;

export const adminPlanAddonSchema = publicPlanAddonSchema.extend({
  active: z.boolean(),
  position: z.number().int(),
  /** Restaurantes com este adicional. */
  subscribers: z.number().int(),
  subscribersWithOtherPrice: z.number().int(),
});
export type AdminPlanAddon = z.infer<typeof adminPlanAddonSchema>;

export const planAddonInputSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(40, "Nome muito longo"),
  resource: z.enum(PLAN_RESOURCES, { error: "Escolha o que o pacote aumenta" }),
  amount: z.number({ error: "Informe quanto aumenta" }).int().min(1, "No mínimo 1").max(999),
  priceCents: z.number({ error: "Informe o valor" }).int().min(1, "Informe o valor").max(10_000_000),
  active: z.boolean().default(true),
  /** Ao mudar o valor: true leva o valor novo para todos os restaurantes com o adicional. */
  applyPriceToSubscribers: z.boolean().default(false),
});
export type PlanAddonInput = z.input<typeof planAddonInputSchema>;

export const planAddonSavedSchema = z.object({ addon: adminPlanAddonSchema, updatedSubscriptions: z.number().int() });

// ---------- o plano visto pelo restaurante ----------

/** Plano do restaurante com os adicionais somados e o uso atual de cada limite. */
export const companyPlanSchema = z.object({
  /** null = sem plano definido (sem limite). */
  plan: z.string().nullable(),
  limits: planLimitsSchema,
  modules: planModulesSchema,
  usage: z.object({ members: z.number().int(), products: z.number().int() }),
  addons: z.array(z.object({ name: z.string(), quantity: z.number().int() })),
});
export type CompanyPlan = z.infer<typeof companyPlanSchema>;
