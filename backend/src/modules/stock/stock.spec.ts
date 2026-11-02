import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { catalogSchema, ingredientSchema, movementSchema, type Ingredient } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarPessoa, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";
import { StockService } from "./stock.service.js";

describe("estoque", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;
  let estoque: StockService;

  let empresaA: string;
  let donoA: string;
  let cardapioA: string; // só catalog.manage
  let caixaA: string; // só orders.create
  let donoB: string;

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${token}`),
    patch: (url: string) => http().patch(url).set("Authorization", `Bearer ${token}`),
    delete: (url: string) => http().delete(url).set("Authorization", `Bearer ${token}`),
  });

  async function ingrediente(token: string, dados: Record<string, unknown>): Promise<Ingredient> {
    const res = await como(token).post("/api/stock/ingredients").send(dados).expect(201);
    return ingredientSchema.parse(res.body);
  }

  async function produtoCom(token: string, receita: { ingredientId: string; quantityMilli: number; removable?: boolean }[]) {
    const cat = await como(token).post("/api/catalog/categories").send({ name: `Cat ${Math.random()}` }).expect(201);
    const res = await como(token)
      .post("/api/catalog/products")
      .send({ categoryId: cat.body.id, name: "Lasanha", priceCents: 4290, recipe: receita })
      .expect(201);
    return res.body.id as string;
  }

  const saldo = async (token: string, id: string) =>
    ((await como(token).get("/api/stock/ingredients")).body as Ingredient[]).find((i) => i.id === id)!.stockMilli;

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
    estoque = app.get(StockService);
  });

  afterAll(async () => {
    await app.close();
    await banco.fechar();
  });

  beforeEach(async () => {
    await banco.limpar();
    const a = await criarRestaurante(banco);
    empresaA = a.companyId;
    const cardapista = await criarPessoa(banco, a.companyId, { permissions: ["catalog.manage"] });
    const caixa = await criarPessoa(banco, a.companyId, { permissions: ["orders.create"] });
    const b = await criarRestaurante(banco);
    donoA = await emitir(a.authUserId);
    cardapioA = await emitir(cardapista.authUserId);
    caixaA = await emitir(caixa.authUserId);
    donoB = await emitir(b.authUserId);
  });

  describe("ingredientes e movimentos", () => {
    it("cria com estoque inicial e registra a entrada no histórico", async () => {
      const queijo = await ingrediente(donoA, { name: "Muçarela", unit: "kg", initialStockMilli: 5000, minStockMilli: 1000 });
      expect(queijo).toMatchObject({ stockMilli: 5000, minStockMilli: 1000, usedIn: 0 });
      const hist = await como(donoA).get(`/api/stock/ingredients/${queijo.id}/movements`).expect(200);
      expect(hist.body.map((m: unknown) => movementSchema.parse(m))).toMatchObject([
        { kind: "entrada", deltaMilli: 5000, balanceAfterMilli: 5000, reason: "Estoque inicial" },
      ]);
    });

    it("entrada soma, perda tira e contagem acerta o saldo", async () => {
      const ovo = await ingrediente(donoA, { name: "Ovo", unit: "un", initialStockMilli: 12000 });
      const mover = (kind: string, quantityMilli: number, reason = "") =>
        como(donoA).post(`/api/stock/ingredients/${ovo.id}/movements`).send({ kind, quantityMilli, reason }).expect(201);

      expect((await mover("entrada", 30000, "Compra")).body.stockMilli).toBe(42000);
      expect((await mover("perda", 2000, "Quebrou")).body.stockMilli).toBe(40000);
      expect((await mover("contagem", 37000)).body.stockMilli).toBe(37000);

      const hist = await como(donoA).get(`/api/stock/ingredients/${ovo.id}/movements`).expect(200);
      expect(hist.body.map((m: { kind: string; deltaMilli: number }) => [m.kind, m.deltaMilli])).toEqual([
        ["contagem", -3000],
        ["perda", -2000],
        ["entrada", 30000],
        ["entrada", 12000],
      ]);
    });

    it("entrada ou perda de zero é recusada", async () => {
      const ovo = await ingrediente(donoA, { name: "Ovo", unit: "un" });
      await como(donoA).post(`/api/stock/ingredients/${ovo.id}/movements`).send({ kind: "perda", quantityMilli: 0 }).expect(400);
    });

    it("não aceita nome repetido no mesmo restaurante", async () => {
      await ingrediente(donoA, { name: "Cebola", unit: "kg" });
      const res = await como(donoA).post("/api/stock/ingredients").send({ name: "CEBOLA", unit: "un" }).expect(409);
      expect(res.body.message).toBe("Já existe um ingrediente com esse nome.");
      await ingrediente(donoB, { name: "Cebola", unit: "kg" });
    });

    it("não troca a unidade de ingrediente com estoque", async () => {
      const farinha = await ingrediente(donoA, { name: "Farinha", unit: "kg", initialStockMilli: 1000 });
      await como(donoA).patch(`/api/stock/ingredients/${farinha.id}`).send({ name: "Farinha", unit: "g" }).expect(409);
      const vazio = await ingrediente(donoA, { name: "Sal", unit: "kg" });
      const res = await como(donoA).patch(`/api/stock/ingredients/${vazio.id}`).send({ name: "Sal fino", unit: "g" }).expect(200);
      expect(res.body).toMatchObject({ name: "Sal fino", unit: "g" });
    });

    it("não apaga ingrediente que está numa ficha técnica", async () => {
      const queijo = await ingrediente(donoA, { name: "Muçarela", unit: "kg" });
      await produtoCom(donoA, [{ ingredientId: queijo.id, quantityMilli: 150 }]);
      const res = await como(donoA).delete(`/api/stock/ingredients/${queijo.id}`).expect(409);
      expect(res.body.message).toContain("Lasanha");
      const solto = await ingrediente(donoA, { name: "Sal", unit: "kg" });
      await como(donoA).delete(`/api/stock/ingredients/${solto.id}`).expect(204);
    });
  });

  describe("ficha técnica no produto", () => {
    it("grava, devolve com nome e unidade, mantém quando não enviada e limpa com lista vazia", async () => {
      const queijo = await ingrediente(donoA, { name: "Muçarela", unit: "kg" });
      const cebola = await ingrediente(donoA, { name: "Cebola", unit: "g" });
      const id = await produtoCom(donoA, [
        { ingredientId: queijo.id, quantityMilli: 150 },
        { ingredientId: cebola.id, quantityMilli: 30000, removable: true },
      ]);
      const ler = async () => catalogSchema.parse((await como(donoA).get("/api/catalog")).body).categories[0]!.products[0]!;
      expect((await ler()).recipe).toEqual([
        { ingredientId: queijo.id, name: "Muçarela", unit: "kg", quantityMilli: 150, removable: false },
        { ingredientId: cebola.id, name: "Cebola", unit: "g", quantityMilli: 30000, removable: true },
      ]);
      const p = await ler();
      await como(donoA).patch(`/api/catalog/products/${id}`).send({ categoryId: p.categoryId, name: "Lasanha", priceCents: 4290 }).expect(200);
      expect((await ler()).recipe).toHaveLength(2);
      await como(donoA).patch(`/api/catalog/products/${id}`).send({ categoryId: p.categoryId, name: "Lasanha", priceCents: 4290, recipe: [] }).expect(200);
      expect((await ler()).recipe).toEqual([]);
    });

    it("recusa ingrediente repetido na ficha", async () => {
      const queijo = await ingrediente(donoA, { name: "Muçarela", unit: "kg" });
      const cat = await como(donoA).post("/api/catalog/categories").send({ name: "Massas" });
      await como(donoA)
        .post("/api/catalog/products")
        .send({
          categoryId: cat.body.id,
          name: "X",
          priceCents: 1,
          recipe: [
            { ingredientId: queijo.id, quantityMilli: 1 },
            { ingredientId: queijo.id, quantityMilli: 2 },
          ],
        })
        .expect(400);
    });
  });

  describe("permissões e isolamento", () => {
    it("estoque exige stock.manage; quem cuida do cardápio só lista os nomes dos ingredientes", async () => {
      await ingrediente(donoA, { name: "Muçarela", unit: "kg", initialStockMilli: 1000 });
      await como(cardapioA).get("/api/stock/ingredients").expect(403);
      await como(caixaA).post("/api/stock/ingredients").send({ name: "X", unit: "un" }).expect(403);
      const opcoes = await como(cardapioA).get("/api/catalog/ingredient-options").expect(200);
      expect(opcoes.body).toEqual([{ id: expect.any(String), name: "Muçarela", unit: "kg" }]);
      await como(caixaA).get("/api/catalog/ingredient-options").expect(403);
    });

    it("restaurante B não vê nem mexe nos ingredientes do A", async () => {
      const queijo = await ingrediente(donoA, { name: "Muçarela", unit: "kg", initialStockMilli: 1000 });
      expect((await como(donoB).get("/api/stock/ingredients")).body).toEqual([]);
      expect((await como(donoB).get("/api/catalog/ingredient-options")).body).toEqual([]);
      await como(donoB).patch(`/api/stock/ingredients/${queijo.id}`).send({ name: "X", unit: "kg" }).expect(404);
      await como(donoB).delete(`/api/stock/ingredients/${queijo.id}`).expect(404);
      await como(donoB).get(`/api/stock/ingredients/${queijo.id}/movements`).expect(404);
      await como(donoB).post(`/api/stock/ingredients/${queijo.id}/movements`).send({ kind: "perda", quantityMilli: 1000 }).expect(404);

      // nem usar o ingrediente do A na ficha técnica de um produto do B
      const cat = await como(donoB).post("/api/catalog/categories").send({ name: "Massas" });
      const res = await como(donoB)
        .post("/api/catalog/products")
        .send({ categoryId: cat.body.id, name: "X", priceCents: 1, recipe: [{ ingredientId: queijo.id, quantityMilli: 1 }] })
        .expect(400);
      expect(res.body.issues[0].path).toBe("recipe");
      expect(await saldo(donoA, queijo.id)).toBe(1000);
    });
  });

  describe("baixa por venda e estorno", () => {
    it("baixa pela ficha técnica, respeita o 'sem cebola' e o estorno devolve exatamente", async () => {
      const queijo = await ingrediente(donoA, { name: "Muçarela", unit: "kg", initialStockMilli: 10_000 });
      const cebola = await ingrediente(donoA, { name: "Cebola", unit: "g", initialStockMilli: 1_000_000 });
      const massa = await ingrediente(donoA, { name: "Massa", unit: "un", initialStockMilli: 50_000 });
      const lasanha = await produtoCom(donoA, [
        { ingredientId: queijo.id, quantityMilli: 150 },
        { ingredientId: cebola.id, quantityMilli: 30_000, removable: true },
        { ingredientId: massa.id, quantityMilli: 1000 },
      ]);

      // 2 lasanhas normais + 1 sem cebola
      const consumo = await banco.db.transaction(async (tx) => {
        const c = await estoque.calcularConsumo(tx, empresaA, [
          { productId: lasanha, quantity: 2 },
          { productId: lasanha, quantity: 1, removedIngredientIds: [cebola.id] },
        ]);
        return estoque.baixar(tx, empresaA, null, c, "Pedido 1");
      });

      expect(await saldo(donoA, queijo.id)).toBe(10_000 - 450);
      expect(await saldo(donoA, cebola.id)).toBe(1_000_000 - 60_000);
      expect(await saldo(donoA, massa.id)).toBe(50_000 - 3000);

      // A ficha muda depois da venda: o estorno usa o consumo guardado, não a ficha nova.
      const p = catalogSchema.parse((await como(donoA).get("/api/catalog")).body).categories[0]!.products[0]!;
      await como(donoA)
        .patch(`/api/catalog/products/${lasanha}`)
        .send({ categoryId: p.categoryId, name: p.name, priceCents: p.priceCents, recipe: [{ ingredientId: queijo.id, quantityMilli: 999 }] })
        .expect(200);

      await banco.db.transaction((tx) => estoque.estornar(tx, empresaA, null, consumo, "Pedido 1 cancelado"));
      expect(await saldo(donoA, queijo.id)).toBe(10_000);
      expect(await saldo(donoA, cebola.id)).toBe(1_000_000);
      expect(await saldo(donoA, massa.id)).toBe(50_000);

      const hist = await como(donoA).get(`/api/stock/ingredients/${queijo.id}/movements`).expect(200);
      expect(hist.body.slice(0, 2).map((m: { kind: string; deltaMilli: number }) => [m.kind, m.deltaMilli])).toEqual([
        ["estorno", 450],
        ["venda", -450],
      ]);
    });

    it("não deixa tirar ingrediente que não é opcional", async () => {
      const massa = await ingrediente(donoA, { name: "Massa", unit: "un", initialStockMilli: 5000 });
      const lasanha = await produtoCom(donoA, [{ ingredientId: massa.id, quantityMilli: 1000 }]);
      await expect(
        banco.db.transaction((tx) =>
          estoque.calcularConsumo(tx, empresaA, [{ productId: lasanha, quantity: 1, removedIngredientIds: [massa.id] }]),
        ),
      ).rejects.toThrow("não pode ser retirado");
    });

    it("venda sem estoque é recusada, lista tudo o que falta e não mexe em nada", async () => {
      const massa = await ingrediente(donoA, { name: "Massa", unit: "un", initialStockMilli: 1000 });
      const queijo = await ingrediente(donoA, { name: "Muçarela", unit: "kg", initialStockMilli: 200 });
      const molho = await ingrediente(donoA, { name: "Molho", unit: "l", initialStockMilli: 10_000 });
      const lasanha = await produtoCom(donoA, [
        { ingredientId: massa.id, quantityMilli: 1000 },
        { ingredientId: queijo.id, quantityMilli: 150 },
        { ingredientId: molho.id, quantityMilli: 100 },
      ]);
      const vender = (quantity: number) =>
        banco.db.transaction(async (tx) =>
          estoque.baixar(tx, empresaA, null, await estoque.calcularConsumo(tx, empresaA, [{ productId: lasanha, quantity }]), "Pedido"),
        );

      const erro = (await vender(3).then(
        () => expect.fail("a venda deveria ser recusada"),
        (e: unknown) => e,
      )) as { getStatus(): number; getResponse(): Record<string, unknown> };
      expect(erro.getStatus()).toBe(409);
      expect(erro.getResponse().message).toBe(
        "Estoque insuficiente: Massa (tem 1 un, precisa de 3 un), Muçarela (tem 0,2 kg, precisa de 0,45 kg).",
      );
      expect(erro.getResponse().shortages).toHaveLength(2);
      // Nada saiu, nem o molho que tinha saldo, e o histórico não ganhou linha.
      expect(await saldo(donoA, molho.id)).toBe(10_000);
      expect(await saldo(donoA, massa.id)).toBe(1000);
      const hist = await como(donoA).get(`/api/stock/ingredients/${molho.id}/movements`).expect(200);
      expect(hist.body).toHaveLength(1);

      // Com saldo exato passa e zera.
      await vender(1);
      expect(await saldo(donoA, massa.id)).toBe(0);
    });

    it("perda maior que o saldo é recusada", async () => {
      const ovo = await ingrediente(donoA, { name: "Ovo", unit: "un", initialStockMilli: 2000 });
      const res = await como(donoA)
        .post(`/api/stock/ingredients/${ovo.id}/movements`)
        .send({ kind: "perda", quantityMilli: 3000 })
        .expect(409);
      expect(res.body.message).toBe("Estoque insuficiente: Ovo (tem 2 un, precisa de 3 un).");
      expect(await saldo(donoA, ovo.id)).toBe(2000);
    });

    it("20 vendas ao mesmo tempo com saldo para 15: passam 15 e o saldo zera", async () => {
      const queijo = await ingrediente(donoA, { name: "Muçarela", unit: "kg", initialStockMilli: 15 * 150 });
      const lasanha = await produtoCom(donoA, [{ ingredientId: queijo.id, quantityMilli: 150 }]);
      const resultados = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          banco.db.transaction(async (tx) =>
            estoque.baixar(tx, empresaA, null, await estoque.calcularConsumo(tx, empresaA, [{ productId: lasanha, quantity: 1 }]), "Pedido"),
          ),
        ),
      );
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(15);
      expect(await saldo(donoA, queijo.id)).toBe(0);
    });

    it("20 vendas seguidas deixam o saldo exato", async () => {
      const queijo = await ingrediente(donoA, { name: "Muçarela", unit: "kg", initialStockMilli: 10_000 });
      const lasanha = await produtoCom(donoA, [{ ingredientId: queijo.id, quantityMilli: 150 }]);
      await Promise.all(
        Array.from({ length: 20 }, () =>
          banco.db.transaction(async (tx) =>
            estoque.baixar(tx, empresaA, null, await estoque.calcularConsumo(tx, empresaA, [{ productId: lasanha, quantity: 1 }]), "Pedido"),
          ),
        ),
      );
      expect(await saldo(donoA, queijo.id)).toBe(10_000 - 20 * 150);
    });
  });
});
