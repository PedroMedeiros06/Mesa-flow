import { describe, expect, it } from "vitest";
import { restaurantLoginSchema } from "./auth.js";

describe("restaurantLoginSchema", () => {
  it("normaliza código e CPF com pontuação", () => {
    const r = restaurantLoginSchema.parse({ companyCode: "482-913", cpf: "123.456.789-09", password: "x" });
    expect(r).toEqual({ companyCode: "482913", cpf: "12345678909", password: "x" });
  });

  it("rejeita CPF curto e código com tamanho errado", () => {
    expect(restaurantLoginSchema.safeParse({ companyCode: "12345", cpf: "123", password: "x" }).success).toBe(false);
  });
});
