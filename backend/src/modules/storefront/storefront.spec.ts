import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq } from "drizzle-orm";
import { publicOrderSchema, storefrontSchema, type Ingredient, type Order } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { companies } from "../../db/schema.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";
import { LIMITE_PEDIDOS } from "./limite.guard.js";

describe("vitrine", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;
  let dono: string;
  let empresa: string;
  let codigo: string;
  let queijo: Ingredient;
  let lasanha: string;

  const http = () => request(app.getHttpServer());
  const comDono = {
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${dono}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${dono}`),
  };
  // Cada teste usa um IP diferente para o limite de pedidos não vazar entre testes.
  let ip = 0;
  const pedir = (corpo: Record<string, unknown>, deIp = `10.0.0.${ip}`) =>
    http().post(`/api/storefront/${codigo}/orders`).set("X-Forwarded-For", deIp).send(corpo);
  const pedido = (extra: Record<string, unknown> = {}) => ({
    clientRequestId: randomUUID(),
    customerName: "Bia",
    customerPhone: "(11) 98888-7777",
    paymentMethod: "pix",
    items: [{ productId: lasanha, quantity: 1 }],
    ...extra,
  });

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
    // Em produção atrás de proxy; aqui permite simular IPs diferentes.
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
    empresa = a.companyId;
    dono = await emitir(a.authUserId);
    const [c] = await banco.db.select({ code: companies.code }).from(companies).where(eq(companies.id, empresa));
    codigo = c!.code;
    queijo = (await comDono.post("/api/stock/ingredients").send({ name: "Muçarela", unit: "kg", initialStockMilli: 300 })).body;
    const cat = await comDono.post("/api/catalog/categories").send({ name: "Massas" });
    lasanha = (
      await comDono
        .post("/api/catalog/products")
        .send({ categoryId: cat.body.id, name: "Lasanha", priceCents: 3000, recipe: [{ ingredientId: queijo.id, quantityMilli: 150 }] })
    ).body.id;
  });

  it("mostra o cardápio sem login, com produto esgotado marcado", async () => {
    const loja = storefrontSchema.parse((await http().get(`/api/storefront/${codigo}`).expect(200)).body);
    expect(loja.company).toEqual({ code: codigo, name: "Cantina da Nona", whatsapp: null });
    expect(loja.menu.categories[0]!.products[0]).toMatchObject({ name: "Lasanha", soldOut: false });

    await comDono.post(`/api/stock/ingredients/${queijo.id}/movements`).send({ kind: "perda", quantityMilli: 200 }).expect(201);
    const depois = storefrontSchema.parse((await http().get(`/api/storefront/${codigo}`).expect(200)).body);
    expect(depois.menu.categories[0]!.products[0]!.soldOut).toBe(true);
  });

  it("restaurante bloqueado ou código que não existe dá 404", async () => {
    await http().get("/api/storefront/999999").expect(404);
    await http().get("/api/storefront/abc").expect(400);
    await banco.db.update(companies).set({ status: "blocked" }).where(eq(companies.id, empresa));
    await http().get(`/api/storefront/${codigo}`).expect(404);
    await pedir(pedido()).expect(404);
  });

  it("pedido do celular entra na fila da cozinha como vitrine, com telefone, e o cliente acompanha", async () => {
    const res = await pedir(pedido({ notes: "Sem pressa" })).expect(201);
    const publico = publicOrderSchema.parse(res.body);
    expect(publico).toMatchObject({ number: 1, status: "novo", totalCents: 3000, company: { name: "Cantina da Nona" } });
    // Dados internos não vão para o cliente
    expect(res.body).not.toHaveProperty("customerPhone");
    expect(res.body).not.toHaveProperty("createdByName");

    const fila = (await comDono.get("/api/orders").expect(200)).body as Order[];
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ origin: "vitrine", customerName: "Bia", customerPhone: "11988887777", createdByName: null });

    await comDono.post(`/api/orders/${publico.id}/cancel`).send({ reason: "Fechamos mais cedo" }).expect(200);
    const acompanhado = (await http().get(`/api/storefront/${codigo}/orders/${publico.id}`).expect(200)).body;
    expect(acompanhado).toMatchObject({ status: "cancelado", cancelReason: "Fechamos mais cedo" });
  });

  it("não aceita desconto pela vitrine, exige nome e telefone e repete sem duplicar", async () => {
    const r = await pedir(pedido({ customerPhone: "123" })).expect(400);
    expect(r.body.issues[0].path).toBe("customerPhone");
    await pedir(pedido({ customerName: "" })).expect(400);
    // desconto é ignorado (o schema da vitrine nem tem o campo)
    const corpo = pedido({ discount: { kind: "percentual", value: 100 } });
    const p1 = await pedir(corpo).expect(201);
    expect(p1.body.totalCents).toBe(3000);
    const p2 = await pedir(corpo).expect(200);
    expect(p2.body.id).toBe(p1.body.id);
  });

  it("sem estoque avisa o cliente sem mostrar saldo", async () => {
    const res = await pedir(pedido({ items: [{ productId: lasanha, quantity: 3 }] })).expect(409);
    expect(res.body.message).toBe("Acabou muçarela agora há pouco. Tire o item do pedido ou escolha outro.");
    expect(res.body).not.toHaveProperty("shortages");
  });

  it("pedido de outro restaurante não aparece no acompanhamento", async () => {
    const b = await criarRestaurante(banco);
    const [c] = await banco.db.select({ code: companies.code }).from(companies).where(eq(companies.id, b.companyId));
    const p = (await pedir(pedido()).expect(201)).body;
    await http().get(`/api/storefront/${c!.code}/orders/${p.id}`).expect(404);
  });

  it(`limita a ${LIMITE_PEDIDOS} pedidos por aparelho em 10 minutos`, async () => {
    await comDono.post(`/api/stock/ingredients/${queijo.id}/movements`).send({ kind: "entrada", quantityMilli: 100_000 });
    for (let i = 0; i < LIMITE_PEDIDOS; i++) await pedir(pedido(), "10.9.9.9").expect(201);
    const r = await pedir(pedido(), "10.9.9.9").expect(429);
    expect(r.body.message).toContain("Muitos pedidos");
    await pedir(pedido(), "10.9.9.10").expect(201);
  });
});
