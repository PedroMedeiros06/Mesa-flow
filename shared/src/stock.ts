import { z } from "zod";

// Quantidades sempre em milésimos da unidade do ingrediente (inteiro): 0,25 kg = 250; 3 un = 3000.
// Assim não há erro de arredondamento ao somar baixas e estornos.

export const UNITS = ["un", "kg", "g", "l", "ml"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  un: "unidade",
  kg: "quilo",
  g: "grama",
  l: "litro",
  ml: "mililitro",
};

/** Maior quantidade aceita num campo: 1 milhão de unidades. */
export const MAX_QUANTITY_MILLI = 1_000_000_000;

/** "0,25" vira 250; "1.500" vira 1500000; aceita até 3 casas decimais. null se inválido ou negativo. */
export function parseQuantity(texto: string): number | null {
  let t = texto.replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*,\d{0,3}$|^\d+,\d{0,3}$/.test(t)) return null;
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  } else if (!/^\d+(\.\d{1,3})?$/.test(t)) {
    return null;
  }
  const [inteiro = "0", fracao = ""] = t.split(".");
  const milli = Number(inteiro) * 1000 + Number(fracao.padEnd(3, "0") || "0");
  if (!Number.isSafeInteger(milli) || milli > MAX_QUANTITY_MILLI) return null;
  return milli;
}

/** 250 + "kg" vira "0,25 kg"; aceita negativo (saída no histórico). */
export function formatQuantity(milli: number, unit: Unit): string {
  const n = (milli / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return `${n} ${unit}`;
}

/** 250 vira "0,25" (para preencher um campo). */
export function quantityToInput(milli: number): string {
  return (milli / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });
}

const quantidade = (mensagem: string) =>
  z.number({ error: mensagem }).int().min(0, "A quantidade não pode ser negativa").max(MAX_QUANTITY_MILLI, "Quantidade acima do limite");

// ---------- entrada ----------

export const ingredientInputSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do ingrediente").max(60, "Use no máximo 60 caracteres"),
  unit: z.enum(UNITS, { error: "Escolha a unidade" }),
  // Abaixo disso o ingrediente aparece como "acabando". null = sem alerta.
  minStockMilli: quantidade("Quantidade mínima inválida").nullable().default(null),
});
export type IngredientInput = z.input<typeof ingredientInputSchema>;

export const ingredientCreateSchema = ingredientInputSchema.extend({
  initialStockMilli: quantidade("Estoque inicial inválido").default(0),
});
export type IngredientCreateInput = z.input<typeof ingredientCreateSchema>;

/** Movimentos que a pessoa registra à mão. Venda e estorno vêm dos pedidos. */
export const MANUAL_MOVEMENTS = ["entrada", "perda", "contagem"] as const;
export const MOVEMENT_KINDS = [...MANUAL_MOVEMENTS, "venda", "estorno"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const movementInputSchema = z.object({
  kind: z.enum(MANUAL_MOVEMENTS),
  // entrada e perda: quanto entrou ou saiu. contagem: quanto há agora na prateleira.
  quantityMilli: quantidade("Informe a quantidade"),
  reason: z.string().trim().max(200, "Use no máximo 200 caracteres").default(""),
});
export type MovementInput = z.input<typeof movementInputSchema>;

export const recipeItemInputSchema = z.object({
  ingredientId: z.uuid("Escolha o ingrediente"),
  quantityMilli: quantidade("Informe a quantidade").min(1, "A quantidade precisa ser maior que zero"),
  // O cliente pode pedir sem este ingrediente ("sem cebola"); aí ele não sai do estoque.
  removable: z.boolean().default(false),
});

// ---------- saída ----------

export const ingredientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  unit: z.enum(UNITS),
  stockMilli: z.number().int(),
  minStockMilli: z.number().int().nullable(),
  /** Em quantas fichas técnicas o ingrediente aparece. */
  usedIn: z.number().int(),
});
export type Ingredient = z.infer<typeof ingredientSchema>;

export const ingredientOptionSchema = ingredientSchema.pick({ id: true, name: true, unit: true });
export type IngredientOption = z.infer<typeof ingredientOptionSchema>;

export const movementSchema = z.object({
  id: z.uuid(),
  kind: z.enum(MOVEMENT_KINDS),
  deltaMilli: z.number().int(),
  balanceAfterMilli: z.number().int(),
  reason: z.string(),
  memberName: z.string().nullable(),
  createdAt: z.string(),
});
export type Movement = z.infer<typeof movementSchema>;

export const recipeItemSchema = z.object({
  ingredientId: z.uuid(),
  name: z.string(),
  unit: z.enum(UNITS),
  quantityMilli: z.number().int(),
  removable: z.boolean(),
});
export type RecipeItem = z.infer<typeof recipeItemSchema>;

export type StockStatus = "ok" | "baixo" | "zerado";

/** Zerado e baixo (no mínimo ou abaixo dele). */
export function stockStatus(i: Pick<Ingredient, "stockMilli" | "minStockMilli">): StockStatus {
  if (i.stockMilli <= 0) return "zerado";
  if (i.minStockMilli !== null && i.stockMilli <= i.minStockMilli) return "baixo";
  return "ok";
}
