import { z } from "zod";

export const BILLING_METHODS = ["pix", "boleto", "cartao", "transferencia", "dinheiro"] as const;
export type BillingMethod = (typeof BILLING_METHODS)[number];
export const BILLING_METHOD_LABELS: Record<BillingMethod, string> = {
  pix: "Pix",
  boleto: "Boleto",
  cartao: "Cartão",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
};

export const INVOICE_STATUSES = ["pending", "paid", "canceled"] as const;

/** Mês no formato AAAA-MM. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido (use AAAA-MM)");

export const billingQuerySchema = z.object({ month: monthSchema.optional() });

/** O nome vem do plano escolhido; o valor pode ser diferente do valor do plano (desconto, preço antigo). */
export const subscriptionInputSchema = z.object({
  planId: z.uuid("Escolha o plano"),
  priceCents: z.number({ error: "Informe o valor" }).int().min(1, "Informe o valor").max(10_000_000),
  dueDay: z.number({ error: "Informe o dia" }).int().min(1, "Dia de 1 a 28").max(28, "Dia de 1 a 28"),
});
export type SubscriptionInput = z.input<typeof subscriptionInputSchema>;

export const subscriptionSchema = z.object({
  planId: z.uuid().nullable(),
  plan: z.string(),
  priceCents: z.number().int(),
  dueDay: z.number().int(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const invoiceSchema = z.object({
  id: z.uuid(),
  /** AAAA-MM-01 */
  reference: z.string(),
  plan: z.string(),
  amountCents: z.number().int(),
  dueDate: z.string(),
  status: z.enum(INVOICE_STATUSES),
  paidAt: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  note: z.string(),
  /** Dias de atraso (pendente com vencimento antes de hoje, em São Paulo). 0 se não está atrasada. */
  daysLate: z.number().int(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const billingRowSchema = z.object({
  company: z.object({ id: z.uuid(), code: z.string(), name: z.string(), status: z.enum(["active", "blocked"]) }),
  subscription: subscriptionSchema.nullable(),
  /** Fatura do mês escolhido. */
  invoice: invoiceSchema.nullable(),
  /** Todas as faturas atrasadas do restaurante, de qualquer mês. */
  overdue: z.object({ count: z.number().int(), totalCents: z.number().int(), maxDaysLate: z.number().int() }),
});
export type BillingRow = z.infer<typeof billingRowSchema>;

export const billingMonthSchema = z.object({
  month: z.string(),
  rows: z.array(billingRowSchema),
  totals: z.object({
    /** Faturas do mês pagas. */
    paidCents: z.number().int(),
    /** Faturas do mês ainda pendentes (atrasadas ou não). */
    pendingCents: z.number().int(),
    /** Atrasado somando todos os meses. */
    overdueCents: z.number().int(),
  }),
});
export type BillingMonth = z.infer<typeof billingMonthSchema>;

export const generateInvoicesSchema = z.object({ month: monthSchema });
export const generateInvoicesResultSchema = z.object({ created: z.number().int() });

export const payInvoiceSchema = z.object({
  method: z.enum(BILLING_METHODS, { error: "Escolha como foi pago" }),
  note: z.string().trim().max(200, "Use no máximo 200 caracteres").default(""),
});
export type PayInvoiceInput = z.input<typeof payInvoiceSchema>;

/** O que o restaurante vê: só as mensalidades atrasadas. */
export const billingStatusSchema = z.object({
  overdue: z.array(
    z.object({ reference: z.string(), amountCents: z.number().int(), dueDate: z.string(), daysLate: z.number().int() }),
  ),
});
export type BillingStatus = z.infer<typeof billingStatusSchema>;
