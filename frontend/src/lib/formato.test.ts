import { describe, expect, it } from "vitest";
import { mascaraCpf, primeiroNome, saudacao } from "./formato";

describe("mascaraCpf", () => {
  it.each([
    ["", ""],
    ["123", "123"],
    ["1234", "123.4"],
    ["1234567", "123.456.7"],
    ["1234567890", "123.456.789-0"],
    ["12345678901", "123.456.789-01"],
    ["123.456.789-01999", "123.456.789-01"],
    ["abc12345678901", "123.456.789-01"],
  ])("%s vira %s", (entrada, saida) => {
    expect(mascaraCpf(entrada)).toBe(saida);
  });
});

describe("textos", () => {
  it("primeiro nome", () => {
    expect(primeiroNome("  Marina Costa ")).toBe("Marina");
  });

  it("saudação pela hora", () => {
    expect(saudacao(new Date(2026, 10, 2, 9))).toBe("Bom dia");
    expect(saudacao(new Date(2026, 10, 2, 14))).toBe("Boa tarde");
    expect(saudacao(new Date(2026, 10, 2, 21))).toBe("Boa noite");
    expect(saudacao(new Date(2026, 10, 2, 2))).toBe("Boa noite");
  });
});
