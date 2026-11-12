import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { tabDetailSchema, type Ingredient, type Order, type TabDetail, type TabSummary } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarPessoa, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";

describe("comandas", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;

  let donoA: string;
  let garcom1: string; // tabs.view + tabs.open
  let garcom2: string; // tabs.view + tabs.open
  let caixaA: string; // tabs.view + tabs.close
  let donoB: string;

  let queijo: Ingredient;
  let pizza: string; // 50,00, gasta 200 g de queijo
  let refri: string; // 8,00, sem ficha técnica

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${token}`),
    patch: (url: string) => http().patch(url).set("Authorization", `Bearer ${token}`),
  });

  const saldo = async (id: string) =>
    ((await como(donoA).get("/api/stock/ingredients")).body as Ingredient[]).find((i) => i.id === id)!.stockMilli;

  const abrir = async (tableNumber: number, token = garcom1): Promise<TabDetail> =>
    tabDetailSchema.parse((await como(token).post("/api/tabs").send({ tableNumber }).expect(201)).body);

  const rodada = (itens: Record<string, unknown>[]) => ({ clientRequestId: randomUUID(), items: itens });
  const lancar = async (tabId: string, itens: Record<string, unknown>[], token = garcom1): Promise<TabDetail> =>
    (await como(token).post(`/api/tabs/${tabId}/rounds`).send(rodada(itens)).expect(201)).body;

  const pagar = (tabId: string, method: string, amountCents: number, extra: Record<string, unknown> = {}) =>
    como(caixaA)
      .post(`/api/tabs/${tabId}/payments`)
      .send({ clientRequestId: randomUUID(), method, amountCents, ...extra });

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
    const g1 = await criarPessoa(banco, a.companyId, { permissions: ["tabs.view", "tabs.open"] });
    const g2 = await criarPessoa(banco, a.companyId, { permissions: ["tabs.view", "tabs.open"] });
    const cx = await criarPessoa(banco, a.companyId, { permissions: ["tabs.view", "tabs.close"] });
    const b = await criarRestaurante(banco);
    donoA = await emitir(a.authUserId);
    garcom1 = await emitir(g1.authUserId);
    garcom2 = await emitir(g2.authUserId);
    caixaA = await emitir(cx.authUserId);
    donoB = await emitir(b.authUserId);

    queijo = (await como(donoA).post("/api/stock/ingredients").send({ name: "Muçarela", unit: "kg", initialStockMilli: 2000 })).body;
    const cat = await como(donoA).post("/api/catalog/categories").send({ name: "Pizzas" });
    pizza = (
      await como(donoA)
        .post("/api/catalog/products")
        .send({ categoryId: cat.body.id, name: "Pizza", priceCents: 5000, recipe: [{ ingredientId: queijo.id, quantityMilli: 200 }] })
        .expect(201)
    ).body.id;
    refri = (await como(donoA).post("/api/catalog/products").send({ categoryId: cat.body.id, name: "Refri", priceCents: 800 })).body.id;
  });

  describe("abrir e lançar", () => {
    it("uma comanda aberta por mesa; a rodada vai para a cozinha marcada com a mesa", async () => {
      const t = await abrir(7);
      expect(t).toMatchObject({ label: "Mesa 7", tableNumber: 7, status: "aberta", serviceFeeBps: 1000, rounds: 0 });
      const repetida = await como(garcom2).post("/api/tabs").send({ tableNumber: 7 }).expect(409);
      expect(repetida.body.message).toContain("já tem uma comanda aberta");
      await como(garcom1).post("/api/tabs").send({}).expect(400);
      const balcao = await como(garcom1).post("/api/tabs").send({ label: "Balcão — João" }).expect(201);
      expect(balcao.body.tableNumber).toBeNull();

      const d = await lancar(t.id, [{ productId: pizza, quantity: 1 }, { productId: refri, quantity: 2 }]);
      // 50 + 16 = 66, taxa 6,60
      expect(d.totals).toEqual({ subtotalCents: 6600, serviceFeeCents: 660, totalCents: 7260, paidCents: 0, remainingCents: 7260 });
      expect(d.orders[0]).toMatchObject({ origin: "mesa", tabId: t.id, tabLabel: "Mesa 7", paymentMethod: null });
      expect(await saldo(queijo.id)).toBe(2000 - 200);

      const fila = (await como(donoA).get("/api/orders").expect(200)).body as Order[];
      expect(fila.map((o) => o.tabLabel)).toEqual(["Mesa 7"]);
      const lista = (await como(garcom1).get("/api/tabs").expect(200)).body as TabSummary[];
      expect(lista.map((x) => x.label)).toEqual(["Mesa 7", "Balcão — João"]);
    });

    it("balcão lança na mesa pelo número: abre se estiver livre, sem duplicar nem deixar mesa vazia", async () => {
      const porNumero = (n: number | string, corpo: Record<string, unknown>, token = garcom1) =>
        como(token).post(`/api/tabs/table/${n}/rounds`).send(corpo);

      const pedido = rodada([{ productId: pizza, quantity: 1 }]);
      const d1 = tabDetailSchema.parse((await porNumero(5, pedido).expect(201)).body);
      expect(d1).toMatchObject({ label: "Mesa 5", tableNumber: 5, status: "aberta", rounds: 1 });
      expect(d1.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["aberta", "rodada"]));
      // Mesmo pedido de novo (clique duplo, rede caiu): não duplica.
      const repetido = tabDetailSchema.parse((await porNumero(5, pedido).expect(201)).body);
      expect(repetido).toMatchObject({ id: d1.id, rounds: 1 });
      // Outro pedido para a mesma mesa: entra na mesma comanda.
      const d2 = tabDetailSchema.parse((await porNumero(5, rodada([{ productId: refri, quantity: 1 }])).expect(201)).body);
      expect(d2).toMatchObject({ id: d1.id, rounds: 2 });

      // Mesa já aberta pelo garçom: o balcão lança nela.
      const t7 = await abrir(7);
      expect((await porNumero(7, rodada([{ productId: refri, quantity: 1 }])).expect(201)).body.id).toBe(t7.id);

      // Falta queijo: nada fica gravado, nem a mesa aberta.
      await porNumero(8, rodada([{ productId: pizza, quantity: 99 }])).expect(409);
      const abertas = (await como(garcom1).get("/api/tabs").expect(200)).body as TabSummary[];
      expect(abertas.some((t) => t.tableNumber === 8)).toBe(false);

      // Dois caixas na mesma mesa livre ao mesmo tempo: uma comanda só, com as duas rodadas.
      const [a, b] = await Promise.all([
        porNumero(6, rodada([{ productId: refri, quantity: 1 }])),
        porNumero(6, rodada([{ productId: refri, quantity: 1 }]), garcom2),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.id).toBe(b.body.id);
      expect(tabDetailSchema.parse((await como(garcom1).get(`/api/tabs/${a.body.id}`)).body).rounds).toBe(2);

      await porNumero(5, rodada([{ productId: refri, quantity: 1 }]), caixaA).expect(403);
      await porNumero(0, rodada([{ productId: refri, quantity: 1 }])).expect(400);
      // Outro restaurante não lança produto deste, nem na mesa 5 dele.
      await porNumero(5, rodada([{ productId: refri, quantity: 1 }]), donoB).expect(400);
    });

    it("dois garçons lançando na mesma mesa ao mesmo tempo: o total soma tudo", async () => {
      const t = await abrir(3);
      await Promise.all([
        ...Array.from({ length: 4 }, () => como(garcom1).post(`/api/tabs/${t.id}/rounds`).send(rodada([{ productId: refri, quantity: 1 }]))),
        ...Array.from({ length: 4 }, () => como(garcom2).post(`/api/tabs/${t.id}/rounds`).send(rodada([{ productId: pizza, quantity: 1 }]))),
      ]).then((rs) => rs.forEach((r) => expect(r.status).toBe(201)));
      const d = tabDetailSchema.parse((await como(garcom1).get(`/api/tabs/${t.id}`).expect(200)).body);
      expect(d.rounds).toBe(8);
      expect(d.totals.subtotalCents).toBe(4 * 800 + 4 * 5000);
      expect(d.events.filter((e) => e.kind === "rodada")).toHaveLength(8);
      expect(await saldo(queijo.id)).toBe(2000 - 4 * 200);
    });

    it("rodada repetida (mesmo clientRequestId) entra uma vez; sem estoque recusa e a conta não muda", async () => {
      const t = await abrir(1);
      const corpo = rodada([{ productId: pizza, quantity: 1 }]);
      await como(garcom1).post(`/api/tabs/${t.id}/rounds`).send(corpo).expect(201);
      await como(garcom1).post(`/api/tabs/${t.id}/rounds`).send(corpo);
      const falta = await como(garcom1).post(`/api/tabs/${t.id}/rounds`).send(rodada([{ productId: pizza, quantity: 10 }])).expect(409);
      expect(falta.body.shortages).toHaveLength(1);
      const d = (await como(garcom1).get(`/api/tabs/${t.id}`)).body as TabDetail;
      expect(d.rounds).toBe(1);
      expect(d.totals.subtotalCents).toBe(5000);
      expect(await saldo(queijo.id)).toBe(1800);
    });
  });

  describe("cancelar item", () => {
    it("exige orders.cancel; devolve estoque só se a cozinha não começou; sem itens, a rodada vira cancelada", async () => {
      const t = await abrir(2);
      let d = await lancar(t.id, [{ productId: pizza, quantity: 1 }, { productId: refri, quantity: 1 }]);
      const [itemPizza, itemRefri] = d.orders[0]!.items;
      await como(garcom1).post(`/api/tabs/${t.id}/items/${itemPizza!.id}/cancel`).send({ reason: "Errou o sabor" }).expect(403);

      d = (await como(donoA).post(`/api/tabs/${t.id}/items/${itemPizza!.id}/cancel`).send({ reason: "Errou o sabor" }).expect(200)).body;
      expect(await saldo(queijo.id)).toBe(2000);
      expect(d.totals.subtotalCents).toBe(800);
      expect(d.orders[0]!.items[0]).toMatchObject({ cancelled: true, cancelReason: "Errou o sabor" });
      expect(d.orders[0]!.totalCents).toBe(800);
      await como(donoA).post(`/api/tabs/${t.id}/items/${itemPizza!.id}/cancel`).send({ reason: "De novo" }).expect(409);

      d = (await como(donoA).post(`/api/tabs/${t.id}/items/${itemRefri!.id}/cancel`).send({ reason: "Desistiu" }).expect(200)).body;
      expect(d.orders[0]!.status).toBe("cancelado");
      expect(d.rounds).toBe(0);
      expect(d.totals.totalCents).toBe(0);

      // Já em preparo: sai da conta, estoque fica.
      d = await lancar(t.id, [{ productId: pizza, quantity: 1 }]);
      const nova = d.orders.find((o) => o.status === "novo")!;
      await como(donoA).patch(`/api/orders/${nova.id}/status`).send({ from: "novo", to: "preparo" }).expect(200);
      d = (await como(donoA).post(`/api/tabs/${t.id}/items/${nova.items[0]!.id}/cancel`).send({ reason: "Demorou" }).expect(200)).body;
      expect(await saldo(queijo.id)).toBe(1800);
      expect(d.events[0]!.description).toContain("estoque não volta");
    });
  });

  describe("transferir e juntar", () => {
    it("transfere uma rodada e junta mesas com os pagamentos", async () => {
      const t1 = await abrir(1);
      const t2 = await abrir(2);
      const d1 = await lancar(t1.id, [{ productId: refri, quantity: 1 }]);
      await lancar(t1.id, [{ productId: pizza, quantity: 1 }]);
      await como(garcom1).post(`/api/tabs/${t1.id}/rounds/${d1.orders[0]!.id}/transfer`).send({ toTabId: t2.id }).expect(403);
      await como(donoA).post(`/api/tabs/${t1.id}/rounds/${d1.orders[0]!.id}/transfer`).send({ toTabId: t1.id }).expect(400);
      const depois = (await como(donoA).post(`/api/tabs/${t1.id}/rounds/${d1.orders[0]!.id}/transfer`).send({ toTabId: t2.id }).expect(200))
        .body as TabDetail;
      expect(depois.totals.subtotalCents).toBe(5000);

      await pagar(t1.id, "pix", 1000).expect(201);
      const junta = (await como(donoA).post(`/api/tabs/${t1.id}/merge`).send({ intoTabId: t2.id }).expect(200)).body as TabDetail;
      expect(junta.id).toBe(t2.id);
      expect(junta.totals).toMatchObject({ subtotalCents: 5800, paidCents: 1000 });
      const velha = (await como(donoA).get(`/api/tabs/${t1.id}`)).body as TabDetail;
      expect(velha).toMatchObject({ status: "juntada", mergedIntoId: t2.id });
      await como(garcom1).post(`/api/tabs/${t1.id}/rounds`).send(rodada([{ productId: refri, quantity: 1 }])).expect(409);
      // a mesa 1 fica livre para outra comanda
      await abrir(1);
    });
  });

  describe("conta", () => {
    it("pagamentos parciais com troco, sem passar do que falta; fecha só quitada e congela os valores", async () => {
      const t = await abrir(5);
      await lancar(t.id, [{ productId: pizza, quantity: 1 }]); // 50 + 5 = 55
      await pagar(t.id, "pix", 6000).expect(400);
      const corpo = { clientRequestId: randomUUID(), method: "credito", amountCents: 2000, payerLabel: "Pessoa 1" };
      await como(caixaA).post(`/api/tabs/${t.id}/payments`).send(corpo).expect(201);
      await como(caixaA).post(`/api/tabs/${t.id}/payments`).send(corpo);
      const fechar = await como(caixaA).post(`/api/tabs/${t.id}/close`).expect(409);
      expect(fechar.body.message).toContain("Falta receber");

      await pagar(t.id, "dinheiro", 3500, { receivedCents: 3000 }).expect(400);
      const d = (await pagar(t.id, "dinheiro", 3500, { receivedCents: 5000 }).expect(201)).body as TabDetail;
      expect(d.payments).toHaveLength(2);
      expect(d.payments[1]).toMatchObject({ amountCents: 3500, changeCents: 1500 });
      expect(d.totals.remainingCents).toBe(0);

      const fechada = (await como(caixaA).post(`/api/tabs/${t.id}/close`).expect(200)).body as TabDetail;
      expect(fechada).toMatchObject({ status: "fechada", totals: { totalCents: 5500, remainingCents: 0 } });
      await como(garcom1).post(`/api/tabs/${t.id}/rounds`).send(rodada([{ productId: refri, quantity: 1 }])).expect(409);
      await pagar(t.id, "pix", 100).expect(409);
      const hoje = (await como(caixaA).get("/api/tabs?scope=hoje").expect(200)).body as TabSummary[];
      expect(hoje.map((x) => x.id)).toEqual([t.id]);
    });

    it("tirar a taxa, estornar pagamento e reabrir com permissão própria", async () => {
      const t = await abrir(6);
      await lancar(t.id, [{ productId: refri, quantity: 1 }]);
      await como(garcom1).patch(`/api/tabs/${t.id}/service-fee`).send({ serviceFeeBps: 0 }).expect(403);
      let d = (await como(caixaA).patch(`/api/tabs/${t.id}/service-fee`).send({ serviceFeeBps: 0 }).expect(200)).body as TabDetail;
      expect(d.totals.totalCents).toBe(800);

      d = (await pagar(t.id, "debito", 800).expect(201)).body;
      const pagamento = d.payments[0]!;
      d = (await como(caixaA).post(`/api/tabs/${t.id}/payments/${pagamento.id}/void`).send({ reason: "Cartão errado" }).expect(200)).body;
      expect(d.payments[0]).toMatchObject({ voided: true, voidReason: "Cartão errado" });
      expect(d.totals.remainingCents).toBe(800);
      await como(caixaA).post(`/api/tabs/${t.id}/payments/${pagamento.id}/void`).send({ reason: "De novo" }).expect(409);

      await pagar(t.id, "pix", 800).expect(201);
      await como(caixaA).post(`/api/tabs/${t.id}/close`).expect(200);
      await como(caixaA).post(`/api/tabs/${t.id}/reopen`).send({ reason: "Faltou lançar a sobremesa" }).expect(403);
      d = (await como(donoA).post(`/api/tabs/${t.id}/reopen`).send({ reason: "Faltou lançar a sobremesa" }).expect(200)).body;
      expect(d.status).toBe("aberta");
      expect(d.events[0]!.description).toContain("Faltou lançar a sobremesa");
      await como(donoA).post(`/api/tabs/${t.id}/reopen`).send({ reason: "Outra vez" }).expect(409);
    });

    it("dois caixas pagando o resto ao mesmo tempo: só um passa", async () => {
      const t = await abrir(8);
      await lancar(t.id, [{ productId: refri, quantity: 1 }]); // 8,80
      const rs = await Promise.all([pagar(t.id, "pix", 880), pagar(t.id, "credito", 880)]);
      expect(rs.map((r) => r.status).sort()).toEqual([201, 400]);
      const d = (await como(caixaA).get(`/api/tabs/${t.id}`)).body as TabDetail;
      expect(d.totals.paidCents).toBe(880);
    });
  });

  describe("isolamento", () => {
    it("restaurante B não vê nem mexe em comanda do A", async () => {
      const t = await abrir(9);
      const d = await lancar(t.id, [{ productId: refri, quantity: 1 }]);
      const b = como(donoB);
      expect((await b.get("/api/tabs").expect(200)).body).toEqual([]);
      await b.get(`/api/tabs/${t.id}`).expect(404);
      await b.post(`/api/tabs/${t.id}/rounds`).send(rodada([{ productId: refri, quantity: 1 }])).expect(404);
      await b.post(`/api/tabs/${t.id}/items/${d.orders[0]!.items[0]!.id}/cancel`).send({ reason: "Invasão" }).expect(404);
      await b.post(`/api/tabs/${t.id}/payments`).send({ clientRequestId: randomUUID(), method: "pix", amountCents: 100 }).expect(404);
      await b.post(`/api/tabs/${t.id}/close`).expect(404);
      const outra = (await b.post("/api/tabs").send({ tableNumber: 9 }).expect(201)).body as TabDetail;
      await b.post(`/api/tabs/${outra.id}/merge`).send({ intoTabId: t.id }).expect(404);
    });
  });
});
