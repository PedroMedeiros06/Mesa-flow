import { z } from "zod";
import { MAX_CENTS } from "./money.js";
import { MAX_ORDER_ITEMS, orderItemInputSchema, orderSchema, PAYMENT_METHODS } from "./orders.js";

// Comandas de mesa. Cada lançamento é uma "rodada": um pedido (origin "mesa") ligado à comanda,
// que passa pela cozinha como qualquer outro. A conta é a soma dos itens não cancelados das rodadas,
// mais a taxa de serviço; os pagamentos vão abatendo até fechar.

export const TAB_STATUSES = ["aberta", "fechada", "juntada"] as const;
export type TabStatus = (typeof TAB_STATUSES)[number];

export const TAB_STATUS_LABELS: Record<TabStatus, string> = {
  aberta: "Aberta",
  fechada: "Fechada",
  juntada: "Juntada a outra",
};

/** Taxa de serviço padrão: 10% (em pontos-base: 1000 = 10,00%). */
export const DEFAULT_SERVICE_FEE_BPS = 1000;
export const MAX_SERVICE_FEE_BPS = 2000;

/** Conta da comanda. A taxa arredonda para o centavo mais próximo. */
export function tabTotals(itemTotals: number[], serviceFeeBps: number, paidCents: number) {
  const subtotalCents = itemTotals.reduce((s, t) => s + t, 0);
  const serviceFeeCents = Math.round((subtotalCents * serviceFeeBps) / 10_000);
  const totalCents = subtotalCents + serviceFeeCents;
  return { subtotalCents, serviceFeeCents, totalCents, paidCents, remainingCents: Math.max(totalCents - paidCents, 0) };
}
export type TabTotals = ReturnType<typeof tabTotals>;

/** Divide um valor em N partes que somam exatamente o valor (os centavos que sobram vão nas primeiras). */
export function splitEvenly(totalCents: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts));
  const base = Math.floor(totalCents / n);
  const resto = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

// ---------- entrada ----------

export const tabOpenSchema = z
  .object({
    tableNumber: z.number().int().min(1, "Mesa de 1 a 999").max(999, "Mesa de 1 a 999").nullable().default(null),
    label: z.string().trim().max(40, "Use no máximo 40 caracteres").default(""),
  })
  .refine((t) => t.tableNumber !== null || t.label.length > 0, {
    path: ["tableNumber"],
    message: "Informe o número da mesa ou um nome para a comanda",
  });
export type TabOpenInput = z.input<typeof tabOpenSchema>;

export const tabRoundInputSchema = z.object({
  clientRequestId: z.uuid(),
  notes: z.string().trim().max(300, "Use no máximo 300 caracteres").default(""),
  items: z
    .array(orderItemInputSchema)
    .min(1, "Adicione pelo menos um item")
    .max(MAX_ORDER_ITEMS, `No máximo ${MAX_ORDER_ITEMS} itens por rodada`),
});
export type TabRoundInput = z.input<typeof tabRoundInputSchema>;

export const tabPaymentInputSchema = z.object({
  clientRequestId: z.uuid(),
  method: z.enum(PAYMENT_METHODS, { error: "Escolha a forma de pagamento" }),
  amountCents: z.number({ error: "Informe o valor" }).int().min(1, "Informe o valor").max(MAX_CENTS),
  /** Dinheiro: quanto a pessoa entregou (o troco sai daqui). */
  receivedCents: z.number().int().min(0).max(MAX_CENTS).nullable().default(null),
  payerLabel: z.string().trim().max(40, "Use no máximo 40 caracteres").default(""),
});
export type TabPaymentInput = z.input<typeof tabPaymentInputSchema>;

export const serviceFeeSchema = z.object({
  serviceFeeBps: z.number().int().min(0).max(MAX_SERVICE_FEE_BPS, "No máximo 20%"),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Diga o motivo").max(200, "Use no máximo 200 caracteres"),
});

export const transferSchema = z.object({ toTabId: z.uuid("Escolha a comanda de destino") });
export const mergeSchema = z.object({ intoTabId: z.uuid("Escolha a comanda de destino") });

// ---------- saída ----------

export const tabPaymentSchema = z.object({
  id: z.uuid(),
  method: z.enum(PAYMENT_METHODS),
  amountCents: z.number().int(),
  receivedCents: z.number().int().nullable(),
  changeCents: z.number().int(),
  payerLabel: z.string(),
  voided: z.boolean(),
  voidReason: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type TabPayment = z.infer<typeof tabPaymentSchema>;

export const tabEventSchema = z.object({
  kind: z.string(),
  description: z.string(),
  memberName: z.string().nullable(),
  createdAt: z.string(),
});
export type TabEvent = z.infer<typeof tabEventSchema>;

const totaisSchema = z.object({
  subtotalCents: z.number().int(),
  serviceFeeCents: z.number().int(),
  totalCents: z.number().int(),
  paidCents: z.number().int(),
  remainingCents: z.number().int(),
});

/** Linha da lista de mesas. */
export const tabSummarySchema = z.object({
  id: z.uuid(),
  label: z.string(),
  tableNumber: z.number().int().nullable(),
  status: z.enum(TAB_STATUSES),
  serviceFeeBps: z.number().int(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  openedByName: z.string().nullable(),
  rounds: z.number().int(),
  totals: totaisSchema,
});
export type TabSummary = z.infer<typeof tabSummarySchema>;

export const tabDetailSchema = tabSummarySchema.extend({
  orders: z.array(orderSchema),
  payments: z.array(tabPaymentSchema),
  events: z.array(tabEventSchema),
  mergedIntoId: z.uuid().nullable(),
});
export type TabDetail = z.infer<typeof tabDetailSchema>;
