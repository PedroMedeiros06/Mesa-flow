import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq } from "drizzle-orm";
import { publicTabSchema, type TabDetail, type TableCode, type TabSummary, type WaiterCall } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { companies, waiterCalls } from "../../db/schema.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarPessoa, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";
import { LIMITE_CHAMADOS } from "./limite-chamados.guard.js";

describe("QR da mesa e chamado do garçom", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;

  let empresaA: string;
  let donoA: string;
  let garcom: string; // tabs.view + tabs.open
  let semAcesso: string; // nenhuma permissão
  let donoB: string;
  let pizza: string;
  let refri: string;

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${token}`),
  });

  // Cada teste usa um IP diferente para o limite de chamados não vazar entre testes.
  let ip = 0;
  const ver = (token: string) => http().get(`/api/table/${token}`);
  const chamar = (token: string, deIp = `10.1.0.${ip}`) => http().post(`/api/table/${token}/call`).set("X-Forwarded-For", deIp);

  const qr = async (mesa: number, dono = donoA): Promise<string> => {
    const r = await como(dono).get(`/api/table-codes?from=${mesa}&to=${mesa}`).expect(200);
    return (r.body as TableCode[])[0]!.token;
  };
  const abrir = async (tableNumber: number): Promise<TabDetail> =>
    (await como(garcom).post("/api/tabs").send({ tableNumber }).expect(201)).body;
  const lancar = async (tabId: string, items: Record<string, unknown>[]): Promise<TabDetail> =>
    (await como(garcom).post(`/api/tabs/${tabId}/rounds`).send({ clientRequestId: randomUUID(), items }).expect(201)).body;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    const emissor = await criarEmissorDeTokens();
    emitir = emissor.token;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DB)
      .useValue(banco.db)
      .overrideProvider(TokenVerifier)
      .useValue(emissor.verifier)
      .overrideProvider(StorageClient)
      .useValue({ publicUrl: (p: string) => `https://fotos/${p}`, upload: async () => {}, remove: async () => {} })
      .compile();
    app = moduleRef.createNestApplication();
    (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", true);
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await banco.fechar();
  });

  beforeEach(async () => {
    ip++;
    await banco.limpar();
    const a = await criarRestaurante(banco, { nome: "Cantina da Nona" });
    empresaA = a.companyId;
    const g = await criarPessoa(banco, a.companyId, { permissions: ["tabs.view", "tabs.open"] });
    const s = await criarPessoa(banco, a.companyId);
    const b = await criarRestaurante(banco);
    donoA = await emitir(a.authUserId);
    garcom = await emitir(g.authUserId);
    semAcesso = await emitir(s.authUserId);
    donoB = await emitir(b.authUserId);
    const cat = await como(donoA).post("/api/catalog/categories").send({ name: "Pizzas" });
    pizza = (await como(donoA).post("/api/catalog/products").send({ categoryId: cat.body.id, name: "Pizza Muçarela", priceCents: 5000 })).body.id;
    refri = (await como(donoA).post("/api/catalog/products").send({ categoryId: cat.body.id, name: "Refri lata", priceCents: 800 })).body.id;
  });

  it("gera o QR uma vez por mesa, só com company.manage, e trocar invalida o antigo", async () => {
    const r1 = (await como(donoA).get("/api/table-codes?from=1&to=3").expect(200)).body as TableCode[];
    expect(r1.map((c) => c.tableNumber)).toEqual([1, 2, 3]);
    expect(r1[0]!.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const r2 = (await como(donoA).get("/api/table-codes?from=2&to=4").expect(200)).body as TableCode[];
    expect(r2[0]!.token).toBe(r1[1]!.token);

    await como(garcom).get("/api/table-codes?from=1&to=1").expect(403);
    await como(donoA).get("/api/table-codes?from=5&to=2").expect(400);
    await como(donoA).get("/api/table-codes?from=1&to=500").expect(400);

    const antigo = r1[0]!.token;
    const novo = (await como(donoA).post("/api/table-codes/1/regenerate").expect(201)).body as TableCode;
    expect(novo.token).not.toBe(antigo);
    await ver(antigo).expect(404);
    await ver(novo.token).expect(200);
    await ver("abc").expect(400);
  });

  it("mostra só a comanda aberta da mesa, sem dados internos e sem itens cancelados", async () => {
    const token = await qr(7);
    expect(publicTabSchema.parse((await ver(token).expect(200)).body)).toEqual({
      company: { name: "Cantina da Nona" },
      tableNumber: 7,
      tab: null,
    });

    const t = await abrir(7);
    await lancar(t.id, [{ productId: pizza, quantity: 1 }]);
    const d = await lancar(t.id, [
      { productId: refri, quantity: 2, notes: "bem gelado" },
      { productId: pizza, quantity: 1 },
    ]);
    const cancelar = d.orders[1]!.items.find((i) => i.name === "Pizza Muçarela")!;
    await como(donoA).post(`/api/tabs/${t.id}/items/${cancelar.id}/cancel`).send({ reason: "Lançou errado" }).expect(200);

    const res = await ver(token).expect(200);
    const v = publicTabSchema.parse(res.body);
    expect(v.tab).toMatchObject({ label: "Mesa 7", openedByName: "Pessoa", calledAt: null });
    // Mais nova primeiro; a pizza cancelada não aparece nem entra no total.
    expect(v.tab!.rounds.map((r) => r.items.map((i) => `${i.quantity}× ${i.name}`))).toEqual([["2× Refri lata"], ["1× Pizza Muçarela"]]);
    expect(v.tab!.totals).toMatchObject({ subtotalCents: 6600, serviceFeeCents: 660, totalCents: 7260 });

    const texto = JSON.stringify(res.body);
    for (const segredo of ["Lançou errado", "bem gelado", "payments", "events", "createdByName", "customerPhone", "cancelReason", empresaA]) {
      expect(texto).not.toContain(segredo);
    }

    // Fechou: o próximo cliente da mesa não vê a conta anterior.
    await como(donoA).post(`/api/tabs/${t.id}/payments`).send({ clientRequestId: randomUUID(), method: "pix", amountCents: 7260 }).expect(201);
    await como(donoA).post(`/api/tabs/${t.id}/close`).expect(200);
    expect((await ver(token).expect(200)).body.tab).toBeNull();
  });

  it("QR de um restaurante nunca mostra mesa de outro; restaurante bloqueado dá 404", async () => {
    await abrir(3);
    const deB = await qr(3, donoB);
    expect((await ver(deB).expect(200)).body.tab).toBeNull();
    await chamar(deB).expect(409);

    const deA = await qr(3);
    await banco.db.update(companies).set({ status: "blocked" }).where(eq(companies.id, empresaA));
    await ver(deA).expect(404);
  });

  it("chamado aparece para a equipe, não duplica e some quando alguém atende", async () => {
    const token = await qr(4);
    await chamar(token).expect(409); // mesa sem conta aberta
    const t = await abrir(4);

    const c1 = await chamar(token).expect(201);
    const [c2, c3] = await Promise.all([chamar(token), chamar(token)]);
    expect([c2.status, c3.status]).toEqual([200, 200]);
    expect(c2.body.calledAt).toBe(c1.body.calledAt);
    expect((await ver(token)).body.tab.calledAt).toBe(c1.body.calledAt);

    const fila = (await como(garcom).get("/api/waiter-calls").expect(200)).body as WaiterCall[];
    expect(fila).toEqual([{ tabId: t.id, label: "Mesa 4", tableNumber: 4, createdAt: c1.body.calledAt }]);
    const mapa = (await como(garcom).get("/api/tabs").expect(200)).body as TabSummary[];
    expect(mapa[0]!.callingSince).toBe(c1.body.calledAt);
    await como(semAcesso).get("/api/waiter-calls").expect(403);
    await como(semAcesso).post(`/api/tabs/${t.id}/call/answer`).expect(403);
    await como(donoB).post(`/api/tabs/${t.id}/call/answer`).expect(404);

    const d = (await como(garcom).post(`/api/tabs/${t.id}/call/answer`).expect(200)).body as TabDetail;
    expect(d.callingSince).toBeNull();
    expect(d.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["chamado", "chamado_atendido"]));
    expect((await como(garcom).get("/api/waiter-calls").expect(200)).body).toEqual([]);
    expect((await ver(token)).body.tab.calledAt).toBeNull();

    // No primeiro minuto depois do atendimento, apertar de novo não chama outra vez.
    await chamar(token).expect(200);
    expect((await como(garcom).get("/api/waiter-calls")).body).toEqual([]);
    // Passado o minuto, chama de novo.
    await banco.db.update(waiterCalls).set({ createdAt: new Date(Date.now() - 61_000) });
    await chamar(token).expect(201);
    expect((await como(garcom).get("/api/waiter-calls")).body).toHaveLength(1);
  });

  it("chamado de comanda fechada sai da fila da equipe", async () => {
    const token = await qr(5);
    const t = await abrir(5);
    await chamar(token).expect(201);
    await como(donoA).post(`/api/tabs/${t.id}/close`).expect(200);
    expect((await como(garcom).get("/api/waiter-calls")).body).toEqual([]);
    await chamar(token).expect(409);
  });

  it(`limita a ${LIMITE_CHAMADOS} chamados por aparelho em 10 minutos`, async () => {
    const token = await qr(6);
    await abrir(6);
    for (let i = 0; i < LIMITE_CHAMADOS; i++) await chamar(token, "10.8.8.8");
    await chamar(token, "10.8.8.8").expect(429);
    await chamar(token, "10.8.8.9").expect(200);
  });
});
