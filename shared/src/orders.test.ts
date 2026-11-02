import { describe, expect, it } from "vitest";
import { orderInputSchema, orderTotals, unitPrice } from "./orders.js";

describe("unitPrice", () => {
  it("usa o promocional quando existe e soma os adicionais", () => {
    expect(unitPrice({ priceCents: 3000, promoPriceCents: null }, [])).toBe(3000);
    expect(unitPrice({ priceCents: 3000, promoPriceCents: 2500 }, [{ priceCents: 400 }, { priceCents: 150 }])).toBe(3050);
  });
});

describe("orderTotals", () => {
  it("sem desconto", () => {
    expect(orderTotals([1000, 2550])).toEqual({ subtotalCents: 3550, discountCents: 0, totalCents: 3550 });
  });
  it("percentual arredonda para o centavo mais próximo", () => {
    // 10% de 33,35 = 3,335 vira 3,34
    expect(orderTotals([3335], { kind: "percentual", value: 10 })).toEqual({
      subtotalCents: 3335,
      discountCents: 334,
      totalCents: 3001,
    });
  });
  it("desconto em valor nunca passa do subtotal", () => {
    expect(orderTotals([1000], { kind: "valor", value: 5000 }).totalCents).toBe(0);
    expect(orderTotals([1000], { kind: "valor", value: 250 }).totalCents).toBe(750);
  });
});

describe("orderInputSchema", () => {
  const base = {
    clientRequestId: "8d4f8a39-7b4f-4f43-9d55-3a1d1d1b2f10",
    paymentMethod: "pix",
    items: [{ productId: "1d4f8a39-7b4f-4f43-9d55-3a1d1d1b2f10", quantity: 2 }],
  };
  it("preenche os padrões", () => {
    const r = orderInputSchema.parse(base);
    expect(r).toMatchObject({ customerName: "", discount: null, receivedCents: null });
    expect(r.items[0]).toMatchObject({ addonIds: [], removedIngredientIds: [], notes: "" });
  });
  it("recusa pedido vazio, quantidade zero e adicional repetido", () => {
    expect(orderInputSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...base, items: [{ ...base.items[0], quantity: 0 }] }).success).toBe(false);
    const repetido = { ...base.items[0], addonIds: [base.clientRequestId, base.clientRequestId] };
    expect(orderInputSchema.safeParse({ ...base, items: [repetido] }).success).toBe(false);
  });
  it("percentual acima de 100 é recusado", () => {
    expect(orderInputSchema.safeParse({ ...base, discount: { kind: "percentual", value: 101 } }).success).toBe(false);
  });
});
