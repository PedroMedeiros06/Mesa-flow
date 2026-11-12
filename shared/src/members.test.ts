import { describe, expect, it } from "vitest";
import { memberCreateSchema, memberUpdateSchema } from "./members.js";

describe("cadastro da equipe", () => {
  it("normaliza CPF, e-mail e permissões (sem repetição, na ordem oficial)", () => {
    const r = memberCreateSchema.parse({
      name: "  Joana  ",
      cpf: "529.982.247-25",
      email: " Joana@Exemplo.COM ",
      permissions: ["tabs.open", "orders.view", "tabs.open"],
    });
    expect(r).toEqual({ name: "Joana", cpf: "52998224725", email: "joana@exemplo.com", permissions: ["orders.view", "tabs.open"] });
  });

  it("recusa permissão desconhecida e alteração vazia", () => {
    expect(memberCreateSchema.safeParse({ name: "Jo", cpf: "52998224725", email: "a@b.co", permissions: ["tudo"] }).success).toBe(false);
    expect(memberUpdateSchema.safeParse({}).success).toBe(false);
    expect(memberUpdateSchema.safeParse({ status: "blocked" }).success).toBe(true);
  });
});
