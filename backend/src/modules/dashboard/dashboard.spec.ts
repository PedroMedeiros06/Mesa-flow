import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { dashboardSummarySchema, type TabDetail } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarPessoa, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";
import { hojeNoFuso } from "./dashboard.service.js";

describe("Início: resumo do dia", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;
  let dono: string;
  let garcom: string;
  let donoB: string;
  let codigo: string;
  let pizza: string;
  let refri: string;

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${token}`),
  });
  const resumo = async (token = dono, query = "") =>
    dashboardSummarySchema.parse((await como(token).get(`/api/dashboard/summary${query}`).expect(200)).body);

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
      .useValue({ publicUrl: (p: string) => p, upload: async () => {}, remove: async () => {} })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await banco.fechar();
  });

  beforeEach(async () => {
    await banco.limpar();
    const a = await criarRestaurante(banco);
    const g = await criarPessoa(banco, a.companyId, { permissions: ["tabs.view", "tabs.open"] });
    const b = await criarRestaurante(banco);
    dono = await emitir(a.authUserId);
    garcom = await emitir(g.authUserId);
    donoB = await emitir(b.authUserId);
    codigo = (await como(dono).get("/api/auth/me").expect(200)).body.company.code;
    const cat = await como(dono).post("/api/catalog/categories").send({ name: "Tudo" });
    pizza = (await como(dono).post("/api/catalog/products").send({ categoryId: cat.body.id, name: "Pizza", priceCents: 5000 })).body.id;
    refri = (await como(dono).post("/api/catalog/products").send({ categoryId: cat.body.id, name: "Refri", priceCents: 800 })).body.id;
  });

  const balcao = (items: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
    como(dono)
      .post("/api/orders")
      .send({ clientRequestId: randomUUID(), paymentMethod: "pix", items, ...extra })
      .expect(201);
  const rodada = async (tabId: string, items: Record<string, unknown>[]): Promise<TabDetail> =>
    (await como(dono).post(`/api/tabs/${tabId}/rounds`).send({ clientRequestId: randomUUID(), items }).expect(201)).body;

  it("soma balcão, vitrine e mesas fechadas sem contar a mesa duas vezes", async () => {
    // Balcão: 2 pizzas com R$ 10 de desconto = 90.
    await balcao([{ productId: pizza, quantity: 2 }], { discount: { kind: "valor", value: 1000 } });
    // Balcão cancelado: fica fora das vendas e aparece em cancelados.
    const b = (await balcao([{ productId: refri, quantity: 1 }])).body;
    await como(dono).post(`/api/orders/${b.id}/cancel`).send({ reason: "Cliente desistiu" }).expect(200);
    // Vitrine: pizza + refri = 58.
    await http()
      .post(`/api/storefront/${codigo}/orders`)
      .send({
        clientRequestId: randomUUID(),
        customerName: "Ana",
        customerPhone: "11999998888",
        paymentMethod: "pix",
        items: [
          { productId: pizza, quantity: 1 },
          { productId: refri, quantity: 1 },
        ],
      })
      .expect(201);
    // Mesa 1: pizza + refri, refri cancelado. 50 + 10% = 55, paga e fechada.
    const m1 = (await como(dono).post("/api/tabs").send({ tableNumber: 1 }).expect(201)).body as TabDetail;
    const d1 = await rodada(m1.id, [
      { productId: pizza, quantity: 1 },
      { productId: refri, quantity: 1 },
    ]);
    const itemRefri = d1.orders[0]!.items.find((i) => i.name === "Refri")!;
    await como(dono).post(`/api/tabs/${m1.id}/items/${itemRefri.id}/cancel`).send({ reason: "Trocou" }).expect(200);
    await como(dono).post(`/api/tabs/${m1.id}/payments`).send({ clientRequestId: randomUUID(), method: "credito", amountCents: 5500 }).expect(201);
    await como(dono).post(`/api/tabs/${m1.id}/close`).expect(200);
    // Mesa 2 aberta: 2 refris = 16 + 10% = 17,60.
    const m2 = (await como(dono).post("/api/tabs").send({ tableNumber: 2 }).expect(201)).body as TabDetail;
    await rodada(m2.id, [{ productId: refri, quantity: 2 }]);

    const r = await resumo();
    expect(r).toMatchObject({
      date: hojeNoFuso(),
      salesCents: 9000 + 5800 + 5500,
      salesCount: 3,
      averageTicketCents: 6767,
      serviceFeeCents: 500,
      discountCents: 1000,
      byOrigin: {
        balcao: { count: 1, totalCents: 9000 },
        vitrine: { count: 1, totalCents: 5800 },
        mesa: { count: 1, totalCents: 5500 },
      },
      cancelled: { count: 1, totalCents: 800 },
      openTabs: { count: 1, totalCents: 1760 },
      kitchenQueue: 4,
    });
    expect(r.topItems).toEqual([
      { name: "Pizza", quantity: 4, totalCents: 20000 },
      { name: "Refri", quantity: 3, totalCents: 2400 },
    ]);
    expect(r.last7Days).toHaveLength(7);
    expect(r.last7Days.at(-1)).toEqual({ date: hojeNoFuso(), salesCents: 20300 });
    expect(r.last7Days.slice(0, 6).every((d) => d.salesCents === 0)).toBe(true);
  });

  it("outro dia, outro restaurante e sem permissão", async () => {
    await balcao([{ productId: pizza, quantity: 1 }]);
    const ontem = await resumo(dono, "?date=2020-01-01");
    expect(ontem).toMatchObject({ date: "2020-01-01", salesCents: 0, salesCount: 0, averageTicketCents: 0, topItems: [] });
    expect((await resumo(donoB)).salesCents).toBe(0);
    await como(garcom).get("/api/dashboard/summary").expect(403);
    await como(dono).get("/api/dashboard/summary?date=ontem").expect(400);
  });

  it("calcula o dia no fuso de São Paulo", () => {
    // 01:30 UTC ainda é o dia anterior em São Paulo (UTC-3).
    expect(hojeNoFuso(new Date("2026-11-12T01:30:00Z"))).toBe("2026-11-11");
  });
});
