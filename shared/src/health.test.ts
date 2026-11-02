import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./health.js";

const valida = {
  status: "ok",
  service: "mesaflow-api",
  version: "0.1.0",
  time: new Date().toISOString(),
  database: "ok",
};

describe("healthResponseSchema", () => {
  it("aceita uma resposta válida", () => {
    expect(healthResponseSchema.safeParse(valida).success).toBe(true);
  });

  it("rejeita status, data ou estado do banco inválidos", () => {
    expect(healthResponseSchema.safeParse({ ...valida, status: "down" }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ ...valida, time: "ontem" }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ ...valida, database: undefined }).success).toBe(false);
  });
});
