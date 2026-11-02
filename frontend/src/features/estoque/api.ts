import {
  ingredientSchema,
  movementSchema,
  type Ingredient,
  type IngredientCreateInput,
  type IngredientInput,
  type Movement,
  type MovementInput,
} from "@mesaflow/shared";
import { sessao } from "@/lib/sessao";

const corpo = (method: string, dados: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(dados),
});

const pedir = (caminho: string, init?: RequestInit) => sessao.requisicao("membro", caminho, init);
const BASE = "/stock/ingredients";

export const apiEstoque = {
  async listar(): Promise<Ingredient[]> {
    return ingredientSchema.array().parse(await (await pedir(BASE)).json());
  },
  async criar(dados: IngredientCreateInput): Promise<Ingredient> {
    return ingredientSchema.parse(await (await pedir(BASE, corpo("POST", dados))).json());
  },
  async editar(id: string, dados: IngredientInput): Promise<Ingredient> {
    return ingredientSchema.parse(await (await pedir(`${BASE}/${id}`, corpo("PATCH", dados))).json());
  },
  async apagar(id: string) {
    await pedir(`${BASE}/${id}`, { method: "DELETE" });
  },
  async movimentar(id: string, dados: MovementInput): Promise<Ingredient> {
    return ingredientSchema.parse(await (await pedir(`${BASE}/${id}/movements`, corpo("POST", dados))).json());
  },
  async historico(id: string): Promise<Movement[]> {
    return movementSchema.array().parse(await (await pedir(`${BASE}/${id}/movements`)).json());
  },
};
