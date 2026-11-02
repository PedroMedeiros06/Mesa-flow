import { describe, expect, it } from "vitest";
import { formatMoney, moneyToInput, parseMoney } from "./money.js";

describe("parseMoney", () => {
  it.each([
    ["12", 1200],
    ["12,5", 1250],
    ["12,50", 1250],
    ["0,99", 99],
    [",5", null],
    ["12,", 1200],
    ["1.234,56", 123456],
    ["1.234", 123400],
    ["12.50", 1250],
    ["12.5", 1250],
    ["R$ 12,50", 1250],
    [" 7 ", 700],
    ["0", 0],
    ["", null],
    ["-5", null],
    ["12,345", null],
    ["12.345,6", 1234560],
    ["1,234.56", null],
    ["abc", null],
    ["100000", 10_000_000],
    ["100000,01", null],
  ])("%j vira %j", (texto, esperado) => {
    expect(parseMoney(texto)).toBe(esperado);
  });
});

describe("formatação", () => {
  it("formatMoney usa o padrão brasileiro", () => {
    expect(formatMoney(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });

  it("moneyToInput volta para o que a pessoa digita", () => {
    expect(moneyToInput(1250)).toBe("12,50");
    expect(parseMoney(moneyToInput(123456))).toBe(123456);
  });
});
