import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./health.js";

describe("healthResponseSchema", () => {
  it("aceita uma resposta válida", () => {
    const ok = healthResponseSchema.safeParse({
      status: "ok",
      service: "mesaflow-api",
      version: "0.1.0",
      time: new Date().toISOString(),
    });
    expect(ok.success).toBe(true);
  });

  it("rejeita status ou data inválidos", () => {
    expect(
      healthResponseSchema.safeParse({ status: "down", service: "mesaflow-api", version: "0.1.0", time: "ontem" })
        .success,
    ).toBe(false);
  });
});
