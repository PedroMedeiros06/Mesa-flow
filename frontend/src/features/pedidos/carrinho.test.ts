import { describe, expect, it } from "vitest";
import type { SellableProduct } from "@mesaflow/shared";
import { adicionar, mudarQuantidade, paraPedido, totalLinha, type NovaLinha } from "./carrinho";

const lasanha: SellableProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Lasanha",
  description: "",
  priceCents: 3000,
  promoPriceCents: 2500,
  imageUrl: null,
  addons: [{ id: "22222222-2222-4222-8222-222222222222", name: "Bacon", priceCents: 400 }],
  removable: [{ ingredientId: "33333333-3333-4333-8333-333333333333", name: "Cebola" }],
};

const linha = (extra: Partial<NovaLinha> = {}): NovaLinha => ({
  produto: lasanha,
  quantidade: 1,
  addonIds: [],
  removidos: [],
  obs: "",
  ...extra,
});

describe("carrinho", () => {
  it("junta escolhas iguais e separa as diferentes", () => {
    let l = adicionar([], linha(), "a");
    l = adicionar(l, linha({ quantidade: 2, obs: " " }), "b");
    l = adicionar(l, linha({ addonIds: [lasanha.addons[0]!.id] }), "c");
    expect(l.map((x) => [x.chave, x.quantidade])).toEqual([
      ["a", 3],
      ["c", 1],
    ]);
  });

  it("preço usa o promocional e soma adicionais", () => {
    expect(totalLinha({ ...linha({ quantidade: 2, addonIds: [lasanha.addons[0]!.id] }), chave: "x" })).toBe(5800);
  });

  it("quantidade zero tira a linha e o máximo é 99", () => {
    const l = adicionar([], linha(), "a");
    expect(mudarQuantidade(l, "a", 0)).toEqual([]);
    expect(mudarQuantidade(l, "a", 500)[0]!.quantidade).toBe(99);
  });

  it("monta os itens no formato da API", () => {
    const l = adicionar([], linha({ removidos: [lasanha.removable[0]!.ingredientId], obs: "bem passada" }), "a");
    expect(paraPedido(l)).toEqual([
      {
        productId: lasanha.id,
        quantity: 1,
        addonIds: [],
        removedIngredientIds: [lasanha.removable[0]!.ingredientId],
        notes: "bem passada",
      },
    ]);
  });
});
