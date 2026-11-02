import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "drizzle-orm";
import { orderSchema, sellableMenuSchema, type Ingredient, type Order } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarPessoa, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";

describe("pedidos", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;

  let donoA: string;
  let caixaA: string; // orders.create + orders.view
  let cozinhaA: string; // orders.view + orders.change_status
  let donoB: string;

  // Cardápio do A: lasanha (30,00; promo 25,00) com adicional bacon 4,00 e cebola opcional
  let queijo: Ingredient;
  let cebola: Ingredient;
  let lasanha: string;
  let bacon: string;
  let suco: string; // sem ficha técnica

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${token}`),
    patch: (url: string) => http().patch(url).set("Authorization", `Bearer ${token}`),
    delete: (url: string) => http().delete(url).set("Authorization", `Bearer ${token}`),
  });

  const pedido = (itens: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
    clientRequestId: randomUUID(),
    paymentMethod: "pix",
    items: itens,
    ...extra,
  });

  const saldo = async (id: string) =>
    ((await como(donoA).get("/api/stock/ingredients")).body as Ingredient[]).find((i) => i.id === id)!.stockMilli;

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
    const caixa = await criarPessoa(banco, a.companyId, { permissions: ["orders.create", "orders.view"] });
    const cozinha = await criarPessoa(banco, a.companyId, { permissions: ["orders.view", "orders.change_status"] });
    const b = await criarRestaurante(banco);
    donoA = await emitir(a.authUserId);
    caixaA = await emitir(caixa.authUserId);
    cozinhaA = await emitir(cozinha.authUserId);
    donoB = await emitir(b.authUserId);

    queijo = (await como(donoA).post("/api/stock/ingredients").send({ name: "Muçarela", unit: "kg", initialStockMilli: 3000 })).body;
    cebola = (await como(donoA).post("/api/stock/ingredients").send({ name: "Cebola", unit: "g", initialStockMilli: 1_000_000 })).body;
    const cat = await como(donoA).post("/api/catalog/categories").send({ name: "Massas" });
    const res = await como(donoA)
      .post("/api/catalog/products")
      .send({
        categoryId: cat.body.id,
        name: "Lasanha",
        priceCents: 3000,
        promoPriceCents: 2500,
        addons: [{ name: "Bacon", priceCents: 400 }],
        recipe: [
          { ingredientId: queijo.id, quantityMilli: 150 },
          { ingredientId: cebola.id, quantityMilli: 30_000, removable: true },
        ],
      })
      .expect(201);
    lasanha = res.body.id;
    bacon = res.body.addons[0].id;
    suco = (await como(donoA).post("/api/catalog/products").send({ categoryId: cat.body.id, name: "Suco", priceCents: 800 })).body.id;
  });

  describe("cardápio para vender", () => {
    it("caixa vê só o que está ativo, com promocional, adicionais e o que dá para tirar", async () => {
      const cat = await como(donoA).post("/api/catalog/categories").send({ name: "Escondida", active: false });
      await como(donoA).post("/api/catalog/products").send({ categoryId: cat.body.id, name: "Oculto", priceCents: 1 });
      const menu = sellableMenuSchema.parse((await como(caixaA).get("/api/orders/menu").expect(200)).body);
      expect(menu.categories).toHaveLength(1);
      expect(menu.categories[0]!.products[0]).toMatchObject({
        name: "Lasanha",
        priceCents: 3000,
        promoPriceCents: 2500,
        addons: [{ name: "Bacon", priceCents: 400 }],
        removable: [{ ingredientId: cebola.id, name: "Cebola" }],
      });
      await como(cozinhaA).get("/api/orders/menu").expect(403);
    });
  });

  describe("criar", () => {
    it("calcula o preço no servidor, guarda cópia dos itens, numera e baixa o estoque", async () => {
      const res = await como(caixaA)
        .post("/api/orders")
        .send(
          pedido(
            [
              { productId: lasanha, quantity: 2, addonIds: [bacon] },
              { productId: lasanha, quantity: 1, removedIngredientIds: [cebola.id], notes: "bem passada" },
              { productId: suco, quantity: 1 },
            ],
            { customerName: "Ana", paymentMethod: "dinheiro", receivedCents: 10000 },
          ),
        )
        .expect(201);
      const o = orderSchema.parse(res.body);
      // (25 + 4) x 2 + 25 + 8 = 91
      expect(o).toMatchObject({
        number: 1,
        status: "novo",
        origin: "balcao",
        customerName: "Ana",
        subtotalCents: 9100,
        discountCents: 0,
        totalCents: 9100,
        receivedCents: 10000,
        changeCents: 900,
      });
      expect(o.items[0]).toMatchObject({ name: "Lasanha", unitPriceCents: 2900, totalCents: 5800, addons: [{ name: "Bacon", priceCents: 400 }] });
      expect(o.items[1]).toMatchObject({ removed: ["Cebola"], notes: "bem passada" });
      expect(await saldo(queijo.id)).toBe(3000 - 3 * 150);
      expect(await saldo(cebola.id)).toBe(1_000_000 - 2 * 30_000);

      const segundo = await como(caixaA).post("/api/orders").send(pedido([{ productId: suco, quantity: 1 }])).expect(201);
      expect(segundo.body.number).toBe(2);
    });

    it("o mesmo clientRequestId duas vezes vira um pedido só e baixa uma vez", async () => {
      const corpo = pedido([{ productId: lasanha, quantity: 1 }]);
      const primeiro = await como(caixaA).post("/api/orders").send(corpo).expect(201);
      const repetido = await como(caixaA).post("/api/orders").send(corpo).expect(200);
      expect(repetido.body.id).toBe(primeiro.body.id);
      expect(await saldo(queijo.id)).toBe(3000 - 150);
    });

    it("sem estoque recusa com o que falta e não grava pedido, número nem movimento", async () => {
      const res = await como(caixaA).post("/api/orders").send(pedido([{ productId: lasanha, quantity: 21 }])).expect(409);
      expect(res.body.message).toBe("Estoque insuficiente: Muçarela (tem 3 kg, precisa de 3,15 kg).");
      expect(res.body.shortages).toHaveLength(1);
      const contagem = await banco.db.execute(sql`select
        (select count(*) from app.orders)::int as pedidos,
        (select count(*) from app.order_counters)::int as contadores,
        (select count(*) from app.stock_movements where kind = 'venda')::int as vendas`);
      expect((contagem as unknown as { rows: unknown[] }).rows[0]).toEqual({ pedidos: 0, contadores: 0, vendas: 0 });
      // e o próximo pedido que cabe é o número 1
      expect((await como(caixaA).post("/api/orders").send(pedido([{ productId: lasanha, quantity: 20 }])).expect(201)).body.number).toBe(1);
    });

    it("recusa produto inativo, adicional de outro produto e tirar ingrediente obrigatório", async () => {
      const r1 = await como(caixaA).post("/api/orders").send(pedido([{ productId: suco, quantity: 1, addonIds: [bacon] }])).expect(400);
      expect(r1.body.issues[0].path).toBe("items.0.addonIds");
      await como(caixaA)
        .post("/api/orders")
        .send(pedido([{ productId: lasanha, quantity: 1, removedIngredientIds: [queijo.id] }]))
        .expect(400);
      const menu = (await como(donoA).get("/api/catalog")).body.categories[0].products.find((p: { id: string }) => p.id === suco);
      await como(donoA)
        .patch(`/api/catalog/products/${suco}`)
        .send({ categoryId: menu.categoryId, name: "Suco", priceCents: 800, active: false })
        .expect(200);
      const r3 = await como(caixaA).post("/api/orders").send(pedido([{ productId: suco, quantity: 1 }])).expect(400);
      expect(r3.body.issues[0].message).toContain("não está mais à venda");
    });

    it("desconto exige permissão própria e o troco não pode faltar", async () => {
      const desconto = { discount: { kind: "percentual", value: 10 } };
      await como(caixaA).post("/api/orders").send(pedido([{ productId: suco, quantity: 1 }], desconto)).expect(403);
      const res = await como(donoA).post("/api/orders").send(pedido([{ productId: suco, quantity: 3 }], desconto)).expect(201);
      expect(res.body).toMatchObject({ subtotalCents: 2400, discountCents: 240, totalCents: 2160 });
      const r = await como(donoA)
        .post("/api/orders")
        .send(pedido([{ productId: suco, quantity: 1 }], { paymentMethod: "dinheiro", receivedCents: 500 }))
        .expect(400);
      expect(r.body.issues[0].path).toBe("receivedCents");
    });

    it("20 pedidos ao mesmo tempo com queijo para 15: passam 15, números de 1 a 15 e o estoque zera", async () => {
      await como(donoA)
        .post(`/api/stock/ingredients/${queijo.id}/movements`)
        .send({ kind: "contagem", quantityMilli: 15 * 150 })
        .expect(201);
      const respostas = await Promise.all(
        Array.from({ length: 20 }, () => como(caixaA).post("/api/orders").send(pedido([{ productId: lasanha, quantity: 1 }]))),
      );
      const criados = respostas.filter((r) => r.status === 201);
      expect(criados).toHaveLength(15);
      expect(respostas.filter((r) => r.status === 409)).toHaveLength(5);
      expect(criados.map((r) => r.body.number).sort((a: number, b: number) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
      expect(await saldo(queijo.id)).toBe(0);
    });
  });

  describe("cozinha", () => {
    async function criar(token = caixaA): Promise<Order> {
      return orderSchema.parse((await como(token).post("/api/orders").send(pedido([{ productId: lasanha, quantity: 1 }])).expect(201)).body);
    }

    it("a fila mostra os ativos do mais antigo ao mais novo e o status anda passo a passo", async () => {
      const p1 = await criar();
      const p2 = await criar();
      const fila = async () => ((await como(cozinhaA).get("/api/orders").expect(200)).body as Order[]).map((o) => o.number);
      expect(await fila()).toEqual([1, 2]);

      const mudar = (id: string, from: string, to: string) => como(cozinhaA).patch(`/api/orders/${id}/status`).send({ from, to });
      expect((await mudar(p1.id, "novo", "preparo").expect(200)).body.status).toBe("preparo");
      // outra tela ainda via "novo": recusa em vez de pular
      const conflito = await mudar(p1.id, "novo", "preparo").expect(409);
      expect(conflito.body.message).toContain("já está como Em preparo");
      await mudar(p1.id, "preparo", "entregue").expect(400);
      await mudar(p1.id, "preparo", "pronto").expect(200);
      await mudar(p1.id, "pronto", "entregue").expect(200);
      expect(await fila()).toEqual([p2.number]);

      const dia = (await como(cozinhaA).get("/api/orders?scope=dia").expect(200)).body as Order[];
      expect(dia.map((o) => o.number)).toEqual([2, 1]);
    });

    it("cancelar exige orders.cancel e motivo, devolve o estoque uma vez só e não vale para entregue", async () => {
      const p = await criar();
      await como(cozinhaA).post(`/api/orders/${p.id}/cancel`).send({ reason: "Cliente desistiu" }).expect(403);
      await como(donoA).post(`/api/orders/${p.id}/cancel`).send({ reason: "" }).expect(400);

      const duplo = await Promise.all([
        como(donoA).post(`/api/orders/${p.id}/cancel`).send({ reason: "Cliente desistiu" }),
        como(donoA).post(`/api/orders/${p.id}/cancel`).send({ reason: "Cliente desistiu" }),
      ]);
      expect(duplo.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await saldo(queijo.id)).toBe(3000);
      const cancelado = (await como(donoA).get(`/api/orders/${p.id}`).expect(200)).body as Order;
      expect(cancelado).toMatchObject({ status: "cancelado", cancelReason: "Cliente desistiu" });

      const entregue = await criar();
      await como(donoA).patch(`/api/orders/${entregue.id}/status`).send({ from: "novo", to: "pronto" }).expect(200);
      await como(donoA).patch(`/api/orders/${entregue.id}/status`).send({ from: "pronto", to: "entregue" }).expect(200);
      const r = await como(donoA).post(`/api/orders/${entregue.id}/cancel`).send({ reason: "Engano" }).expect(409);
      expect(r.body.message).toContain("já foi entregue");
    });

    it("cancelamento segue mesmo se um ingrediente da venda foi apagado depois", async () => {
      const p = await criar();
      const cat = (await como(donoA).get("/api/catalog")).body.categories[0];
      await como(donoA)
        .patch(`/api/catalog/products/${lasanha}`)
        .send({ categoryId: cat.id, name: "Lasanha", priceCents: 3000, recipe: [{ ingredientId: queijo.id, quantityMilli: 150 }] })
        .expect(200);
      await como(donoA).delete(`/api/stock/ingredients/${cebola.id}`).expect(204);
      await como(donoA).post(`/api/orders/${p.id}/cancel`).send({ reason: "Cliente desistiu" }).expect(200);
      expect(await saldo(queijo.id)).toBe(3000);
    });

    it("produto apagado não quebra o histórico do pedido", async () => {
      const p = await como(caixaA).post("/api/orders").send(pedido([{ productId: suco, quantity: 2 }])).expect(201);
      await como(donoA).delete(`/api/catalog/products/${suco}`).expect(204);
      const lido = (await como(donoA).get(`/api/orders/${p.body.id}`).expect(200)).body as Order;
      expect(lido.items[0]).toMatchObject({ productId: null, name: "Suco", totalCents: 1600 });
    });
  });

  describe("isolamento", () => {
    it("restaurante B não vê, não muda e não cancela pedido do A, nem vende produto do A", async () => {
      const p = (await como(caixaA).post("/api/orders").send(pedido([{ productId: lasanha, quantity: 1 }])).expect(201)).body as Order;
      expect((await como(donoB).get("/api/orders?scope=dia").expect(200)).body).toEqual([]);
      await como(donoB).get(`/api/orders/${p.id}`).expect(404);
      await como(donoB).patch(`/api/orders/${p.id}/status`).send({ from: "novo", to: "preparo" }).expect(404);
      await como(donoB).post(`/api/orders/${p.id}/cancel`).send({ reason: "Invasão" }).expect(404);
      await como(donoB).post("/api/orders").send(pedido([{ productId: lasanha, quantity: 1 }])).expect(400);
      expect(await saldo(queijo.id)).toBe(3000 - 150);
    });
  });
});
