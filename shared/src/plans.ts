import { z } from "zod";

/** Plano como aparece no site (só os ativos, na ordem escolhida). */
export const publicPlanSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceCents: z.number().int(),
  description: z.string(),
  features: z.array(z.string()),
  highlighted: z.boolean(),
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
