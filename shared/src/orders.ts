import { z } from "zod";
import { MAX_CENTS } from "./money.js";

// Pedidos de balcão (e, nas próximas etapas, da vitrine e das mesas).
// O cliente manda só o que escolheu; o preço é sempre calculado no servidor com a função abaixo,
// e a tela usa a mesma função para mostrar o total antes de enviar.

export const ORDER_STATUSES = ["novo", "preparo", "pronto", "entregue", "cancelado"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  novo: "Novo",
  preparo: "Em preparo",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

/** Para onde cada status pode ir pela fila da cozinha (cancelar é outra ação). Voltar um passo corrige engano. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  novo: ["preparo", "pronto"],
  preparo: ["pronto", "novo"],
  pronto: ["entregue", "preparo"],
  entregue: [],
  cancelado: [],
};

/** Próximo passo natural (o botão grande da cozinha). */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  novo: "preparo",
  preparo: "pronto",
  pronto: "entregue",
};

/** Pedidos ainda na fila da cozinha. */
export const ACTIVE_STATUSES = ["novo", "preparo", "pronto"] as const satisfies readonly OrderStatus[];

export const ORDER_ORIGINS = ["balcao", "vitrine", "mesa"] as const;
export type OrderOrigin = (typeof ORDER_ORIGINS)[number];
export const ORDER_ORIGIN_LABELS: Record<OrderOrigin, string> = { balcao: "Balcão", vitrine: "Vitrine", mesa: "Mesa" };

export const PAYMENT_METHODS = ["dinheiro", "pix", "credito", "debito"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  credito: "Crédito",
  debito: "Débito",
};

export const MAX_ITEM_QUANTITY = 99;
export const MAX_ORDER_ITEMS = 50;

// ---------- preço ----------

export const DISCOUNT_KINDS = ["valor", "percentual"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export interface Discount {
  kind: DiscountKind;
  /** valor: centavos; percentual: 1 a 100. */
  value: number;
}

/** Preço de uma unidade: preço promocional (se houver) mais os adicionais escolhidos. */
export function unitPrice(product: { priceCents: number; promoPriceCents: number | null }, addons: { priceCents: number }[]) {
  return (product.promoPriceCents ?? product.priceCents) + addons.reduce((s, a) => s + a.priceCents, 0);
}

/**
 * Subtotal, desconto e total. Percentual arredonda para o centavo mais próximo;
 * o desconto nunca passa do subtotal.
 */
export function orderTotals(itemTotals: number[], discount?: Discount | null) {
  const subtotalCents = itemTotals.reduce((s, t) => s + t, 0);
  let discountCents = 0;
  if (discount) {
    discountCents = discount.kind === "valor" ? discount.value : Math.round((subtotalCents * discount.value) / 100);
    discountCents = Math.min(Math.max(discountCents, 0), subtotalCents);
  }
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

// ---------- entrada ----------

const ids = (max: number) =>
  z
    .array(z.uuid())
    .max(max)
    .refine((l) => new Set(l).size === l.length, "Item repetido")
    .default([]);

export const orderItemInputSchema = z.object({
  productId: z.uuid(),
  quantity: z
    .number({ error: "Informe a quantidade" })
    .int()
    .min(1, "Quantidade mínima é 1")
    .max(MAX_ITEM_QUANTITY, `No máximo ${MAX_ITEM_QUANTITY} por item`),
  addonIds: ids(20),
  removedIngredientIds: ids(50),
  notes: z.string().trim().max(140, "Use no máximo 140 caracteres").default(""),
});
export type OrderItemInput = z.input<typeof orderItemInputSchema>;

export const discountSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("valor"), value: z.number().int().min(1, "Informe o desconto").max(MAX_CENTS) }),
  z.object({
    kind: z.literal("percentual"),
    value: z.number().int("Use um percentual inteiro").min(1, "Informe o desconto").max(100, "No máximo 100%"),
  }),
]);

export const orderInputSchema = z.object({
  /** Gerado na tela ao montar o pedido: clique duplo ou nova tentativa não duplica. */
  clientRequestId: z.uuid(),
  customerName: z.string().trim().max(60, "Use no máximo 60 caracteres").default(""),
  notes: z.string().trim().max(300, "Use no máximo 300 caracteres").default(""),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Escolha a forma de pagamento" }),
  /** Só no dinheiro: quanto o cliente entregou, para calcular o troco. */
  receivedCents: z.number().int().min(0).max(MAX_CENTS).nullable().default(null),
  discount: discountSchema.nullable().default(null),
  items: z
    .array(orderItemInputSchema)
    .min(1, "Adicione pelo menos um item")
    .max(MAX_ORDER_ITEMS, `No máximo ${MAX_ORDER_ITEMS} itens por pedido`),
});
export type OrderInput = z.input<typeof orderInputSchema>;

export const statusChangeSchema = z.object({
  /** Status que a tela estava vendo: se outra tela mudou antes, a API recusa em vez de pular etapas. */
  from: z.enum(ORDER_STATUSES),
  to: z.enum(ORDER_STATUSES),
});
export type StatusChange = z.infer<typeof statusChangeSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3, "Diga o motivo do cancelamento").max(200, "Use no máximo 200 caracteres"),
});

// ---------- saída ----------

export const orderItemSchema = z.object({
  id: z.uuid(),
  productId: z.uuid().nullable(),
  name: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  addons: z.array(z.object({ name: z.string(), priceCents: z.number().int() })),
  removed: z.array(z.string()),
  notes: z.string(),
  totalCents: z.number().int(),
  /** Item tirado da conta (só em rodadas de mesa). */
  cancelled: z.boolean(),
  cancelReason: z.string().nullable(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  origin: z.enum(ORDER_ORIGINS),
  status: z.enum(ORDER_STATUSES),
  customerName: z.string(),
  customerPhone: z.string(),
  notes: z.string(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  subtotalCents: z.number().int(),
  discountCents: z.number().int(),
  totalCents: z.number().int(),
  receivedCents: z.number().int().nullable(),
  changeCents: z.number().int(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  statusChangedAt: z.string(),
  cancelReason: z.string().nullable(),
  /** Rodada de mesa: a comanda de onde veio. */
  tabId: z.uuid().nullable(),
  tabLabel: z.string().nullable(),
  items: z.array(orderItemSchema),
});
export type Order = z.infer<typeof orderSchema>;

/** Cardápio para vender: só o que está ativo, sem custo nem estoque. */
export const sellableProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  priceCents: z.number().int(),
  promoPriceCents: z.number().int().nullable(),
  imageUrl: z.string().nullable(),
  addons: z.array(z.object({ id: z.uuid(), name: z.string(), priceCents: z.number().int() })),
  removable: z.array(z.object({ ingredientId: z.uuid(), name: z.string() })),
  /** Algum ingrediente obrigatório não dá nem para uma unidade. */
  soldOut: z.boolean(),
});
export type SellableProduct = z.infer<typeof sellableProductSchema>;

export const sellableMenuSchema = z.object({
  categories: z.array(z.object({ id: z.uuid(), name: z.string(), products: z.array(sellableProductSchema) })),
});
export type SellableMenu = z.infer<typeof sellableMenuSchema>;

// ---------- vitrine (público, sem login) ----------

/** Celular ou fixo com DDD: 10 ou 11 dígitos. */
export function normalizePhone(texto: string): string {
  return texto.replace(/\D/g, "");
}

export const storefrontOrderInputSchema = z.object({
  clientRequestId: z.uuid(),
  customerName: z.string().trim().min(2, "Informe seu nome").max(60, "Use no máximo 60 caracteres"),
  customerPhone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.string().regex(/^\d{10,11}$/, "Informe o telefone com DDD")),
  notes: z.string().trim().max(300, "Use no máximo 300 caracteres").default(""),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Escolha como vai pagar" }),
  /** Dinheiro: "troco para quanto". */
  receivedCents: z.number().int().min(0).max(MAX_CENTS).nullable().default(null),
  items: z
    .array(orderItemInputSchema)
    .min(1, "Adicione pelo menos um item")
    .max(MAX_ORDER_ITEMS, `No máximo ${MAX_ORDER_ITEMS} itens por pedido`),
});
export type StorefrontOrderInput = z.input<typeof storefrontOrderInputSchema>;

export const storefrontSchema = z.object({
  company: z.object({ code: z.string(), name: z.string(), whatsapp: z.string().nullable() }),
  menu: sellableMenuSchema,
});
export type Storefront = z.infer<typeof storefrontSchema>;

/** O que o cliente vê ao acompanhar o pedido: sem dados internos (quem lançou, telefone, troco). */
export const publicOrderSchema = orderSchema
  .pick({
    id: true,
    number: true,
    status: true,
    customerName: true,
    notes: true,
    paymentMethod: true,
    totalCents: true,
    createdAt: true,
    statusChangedAt: true,
    cancelReason: true,
    items: true,
  })
  .extend({ company: z.object({ code: z.string(), name: z.string(), whatsapp: z.string().nullable() }) });
export type PublicOrder = z.infer<typeof publicOrderSchema>;
