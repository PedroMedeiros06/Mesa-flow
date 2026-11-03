import { describe, expect, it } from "vitest";
import { splitEvenly, tabOpenSchema, tabTotals } from "./tabs.js";

describe("tabTotals", () => {
  it("soma itens, aplica 10% arredondando e abate o pago", () => {
    expect(tabTotals([4290, 905], 1000, 2000)).toEqual({
      subtotalCents: 5195,
      serviceFeeCents: 520,
      totalCents: 5715,
      paidCents: 2000,
      remainingCents: 3715,
    });
  });
  it("sem taxa e pago a mais não deixa falta negativa", () => {
    expect(tabTotals([1000], 0, 1500)).toMatchObject({ totalCents: 1000, remainingCents: 0 });
  });
});

describe("splitEvenly", () => {
  it("divide sem perder centavo", () => {
    expect(splitEvenly(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEvenly(10000, 3).reduce((a, b) => a + b, 0)).toBe(10000);
    expect(splitEvenly(500, 0)).toEqual([500]);
  });
});

describe("tabOpenSchema", () => {
  it("precisa de número ou nome", () => {
    expect(tabOpenSchema.safeParse({}).success).toBe(false);
    expect(tabOpenSchema.parse({ tableNumber: 7 })).toEqual({ tableNumber: 7, label: "" });
    expect(tabOpenSchema.parse({ label: "Balcão, João" }).tableNumber).toBeNull();
  });
});
