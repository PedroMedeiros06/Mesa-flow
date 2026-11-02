import { describe, expect, it } from "vitest";
import { fetchHealth } from "./api";

const resposta = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("fetchHealth", () => {
  it("devolve a resposta validada", async () => {
    const health = await fetchHealth(
      resposta({
        status: "ok",
        service: "mesaflow-api",
        version: "0.1.0",
        time: new Date().toISOString(),
        database: "ok",
      }),
    );
    expect(health.status).toBe("ok");
  });

  it("falha quando o formato não bate com o shared", async () => {
    await expect(fetchHealth(resposta({ status: "ok" }))).rejects.toThrow();
  });

  it("explica quando o servidor está fora do ar", async () => {
    const semRede = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fetchHealth(semRede)).rejects.toThrow("Não foi possível conectar ao servidor.");
  });
});
