import { z } from "zod";
import { MAX_CENTS } from "./money.js";
import { recipeItemInputSchema, recipeItemSchema } from "./stock.js";

const texto = (max: number, mensagem: string) =>
  z.string().trim().min(1, mensagem).max(max, `Use no máximo ${max} caracteres`);

const precoCents = z
  .number({ error: "Informe o preço" })
  .int("Preço em centavos")
  .min(0, "O preço não pode ser negativo")
  .max(MAX_CENTS, "Preço acima do limite");

export const MAX_ADDONS = 20;
export const MAX_PRODUCT_IMAGES = 4;
/** Tamanho máximo de cada foto enviada (3 MB). */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

// ---------- entrada ----------

export const categoryInputSchema = z.object({
  name: texto(60, "Informe o nome da categoria"),
  active: z.boolean().default(true),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

export const addonInputSchema = z.object({
  name: texto(60, "Informe o nome do adicional"),
  priceCents: precoCents,
  active: z.boolean().default(true),
});

export const productInputSchema = z.object({
  categoryId: z.uuid("Escolha a categoria"),
  name: texto(80, "Informe o nome do produto"),
  description: z.string().trim().max(300, "Use no máximo 300 caracteres").default(""),
  priceCents: precoCents,
  active: z.boolean().default(true),
  // A lista enviada substitui a anterior, na ordem em que veio.
  addons: z.array(addonInputSchema).max(MAX_ADDONS, `No máximo ${MAX_ADDONS} adicionais`).default([]),
  // Ficha técnica. Ausente = mantém a atual; lista (mesmo vazia) = substitui.
  recipe: z
    .array(recipeItemInputSchema)
    .max(50, "No máximo 50 ingredientes")
    .refine((itens) => new Set(itens.map((i) => i.ingredientId)).size === itens.length, "Ingrediente repetido na ficha técnica")
    .optional(),
});
export type ProductInput = z.input<typeof productInputSchema>;

export const reorderSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
});
export type ReorderInput = z.infer<typeof reorderSchema>;

// ---------- saída ----------

export const addonSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceCents: z.number().int(),
  active: z.boolean(),
});
export type Addon = z.infer<typeof addonSchema>;

export const productImageSchema = z.object({
  id: z.uuid(),
  url: z.string(),
});
export type ProductImage = z.infer<typeof productImageSchema>;

export const productSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  description: z.string(),
  priceCents: z.number().int(),
  active: z.boolean(),
  addons: z.array(addonSchema),
  images: z.array(productImageSchema),
  recipe: z.array(recipeItemSchema),
});
export type Product = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  active: z.boolean(),
  products: z.array(productSchema),
});
export type Category = z.infer<typeof categorySchema>;

export const catalogSchema = z.object({
  categories: z.array(categorySchema),
});
export type Catalog = z.infer<typeof catalogSchema>;
