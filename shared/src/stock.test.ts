import { describe, expect, it } from "vitest";
import { formatQuantity, parseQuantity, quantityToInput, stockStatus } from "./stock.js";

describe("parseQuantity", () => {
  it.each([
    ["1", 1000],
    ["0,25", 250],
    ["0,5", 500],
    ["2,125", 2125],
    ["2.5", 2500],
    ["1.500", 1_500_000],
    ["1.500,5", 1_500_500],
    ["0", 0],
    ["", null],
    ["-1", null],
    ["0,1234", null],
    ["abc", null],
    ["1000001", null],
  ])("%j vira %j", (texto, esperado) => {
    expect(parseQuantity(texto)).toBe(esperado);
  });
});

describe("formatação", () => {
  it("mostra a quantidade com a unidade", () => {
    expect(formatQuantity(250, "kg")).toBe("0,25 kg");
    expect(formatQuantity(3000, "un")).toBe("3 un");
    expect(formatQuantity(-500, "l")).toBe("-0,5 l");
    expect(formatQuantity(1_500_000, "g")).toBe("1.500 g");
  });

  it("volta para o campo sem separador de milhar", () => {
    expect(quantityToInput(1_500_500)).toBe("1500,5");
    expect(parseQuantity(quantityToInput(2125))).toBe(2125);
  });
});

describe("stockStatus", () => {
  it("zerado, baixo e ok", () => {
    expect(stockStatus({ stockMilli: 0, minStockMilli: null })).toBe("zerado");
    expect(stockStatus({ stockMilli: -10, minStockMilli: 100 })).toBe("zerado");
    expect(stockStatus({ stockMilli: 100, minStockMilli: 100 })).toBe("baixo");
    expect(stockStatus({ stockMilli: 101, minStockMilli: 100 })).toBe("ok");
    expect(stockStatus({ stockMilli: 5, minStockMilli: null })).toBe("ok");
  });
});
