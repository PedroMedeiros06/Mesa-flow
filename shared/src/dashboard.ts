import { z } from "zod";

/** Dia no formato AAAA-MM-DD, sempre no fuso do restaurante (São Paulo). */
export const dashboardQuerySchema = z.object({
  date: z.iso.date("Data inválida").optional(),
});

const origem = z.object({ count: z.number().int(), totalCents: z.number().int() });

/**
 * Resumo de um dia. O que conta como venda (decisão registrada no docs/ESTRUTURA.md):
 * - pedido de balcão ou da vitrine que não foi cancelado, pelo dia do pedido;
 * - comanda de mesa fechada naquele dia, pelo total congelado no fechamento (com a taxa de serviço).
 * Rodadas de mesa não contam sozinhas, para a mesa não entrar duas vezes. Mesa aberta aparece à parte.
 */
export const dashboardSummarySchema = z.object({
  date: z.string(),
  salesCents: z.number().int(),
  /** Pedidos de balcão e vitrine + comandas fechadas. */
  salesCount: z.number().int(),
  averageTicketCents: z.number().int(),
  serviceFeeCents: z.number().int(),
  discountCents: z.number().int(),
  byOrigin: z.object({ balcao: origem, vitrine: origem, mesa: origem }),
  cancelled: z.object({ count: z.number().int(), totalCents: z.number().int() }),
  openTabs: z.object({ count: z.number().int(), totalCents: z.number().int() }),
  /** Pedidos esperando a cozinha agora (novo ou em preparo), de qualquer dia. */
  kitchenQueue: z.number().int(),
  topItems: z.array(z.object({ name: z.string(), quantity: z.number().int(), totalCents: z.number().int() })),
  /** Vendas dos 7 dias que terminam na data pedida, do mais antigo para o mais novo. */
  last7Days: z.array(z.object({ date: z.string(), salesCents: z.number().int() })),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
