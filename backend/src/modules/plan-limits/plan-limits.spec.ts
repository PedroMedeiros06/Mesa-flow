import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "drizzle-orm";
import { companyPlanSchema, type AdminPlan, type AdminPlanAddon } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { AuthAdmin } from "../../auth/supabase-admin.client.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { platformAdmins } from "../../db/schema.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";

describe("Limites e recursos do plano", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;
  let admin: string;
  let dono: string;
  let empresa: string;
  let codigo: string;
  let essencial: AdminPlan;
  let maisMesas: AdminPlanAddon;

  const usuarios = new Set<string>();
  const authAdmin: AuthAdmin = {
    async createUser(email) {
      if (usuarios.has(email)) throw new ConflictException("Este e-mail já tem acesso ao MesaFlow. Use outro e-mail.");
      const id = randomUUID();
      await banco.db.execute(sql`insert into auth.users (id) values (${id})`);
      usuarios.add(email);
      return id;
    },
    async deleteUser() {},
    async passwordToken() {
      return "tk";
    },
  };

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${token}`),
    put: (url: string) => http().put(url).set("Authorization", `Bearer ${token}`),
  });
  const assinar = (addons: { addonId: string; quantity: number }[] = []) =>
    como(admin).put(`/api/admin/companies/${empresa}/subscription`).send({ planId: essencial.id, priceCents: 4990, dueDay: 10, addons }).expect(200);
  /** Edita o Essencial (só os campos pedidos mudam). */
  const mudarPlano = (extra: Record<string, unknown>) =>
    como(admin)
      .put(`/api/admin/plans/${essencial.id}`)
      .send({
        name: essencial.name,
        priceCents: essencial.priceCents,
        description: essencial.description,
        features: essencial.features,
        highlighted: essencial.highlighted,
        active: essencial.active,
        limits: essencial.limits,
        modules: essencial.modules,
        ...extra,
      })
      .expect(200);
  const pessoa = (n: number) => ({ name: `Pessoa ${n}`, cpf: `${String(n).padStart(9, "0")}00`, email: `p${n}@x.com`, permissions: [] });

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
      .overrideProvider(AuthAdmin)
      .useValue(authAdmin)
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
    usuarios.clear();
    // Volta o Essencial ao que a migração 0010 deixa: 10 mesas, 3 pessoas, tudo liberado.
    await banco.db.execute(
      sql`update app.plans set max_tables = 10, max_members = 3, max_products = null, feature_tabs = true, feature_stock = true, feature_storefront = true where name = 'Essencial'`,
    );
    const adminId = randomUUID();
    await banco.db.execute(sql`insert into auth.users (id) values (${adminId})`);
    await banco.db.insert(platformAdmins).values({ authUserId: adminId, name: "Admin", email: "admin@mesaflow.com" });
    admin = await emitir(adminId);
    const a = await criarRestaurante(banco);
    empresa = a.companyId;
    dono = await emitir(a.authUserId);
    codigo = (await como(dono).get("/api/auth/me")).body.company.code;
    essencial = ((await como(admin).get("/api/admin/plans").expect(200)).body as AdminPlan[]).find((p) => p.name === "Essencial")!;
    maisMesas = ((await como(admin).get("/api/admin/addons").expect(200)).body as AdminPlanAddon[]).find((p) => p.name === "+10 mesas")!;
  });

  it("vem da migração: Essencial com 10 mesas e 3 pessoas, e o pacote +10 mesas por R$ 30", async () => {
    expect(essencial).toMatchObject({ limits: { tables: 10, members: 3, products: null }, modules: { tabs: true, stock: true, storefront: true } });
    expect(maisMesas).toMatchObject({ resource: "tables", amount: 10, priceCents: 3000, active: true });
    const site = (await http().get("/api/plans").expect(200)).body as { name: string; limits: unknown }[];
    expect(site.find((p) => p.name === "Essencial")!.limits).toEqual({ tables: 10, members: 3, products: null });
    expect((await http().get("/api/plans/addons").expect(200)).body).toEqual([expect.objectContaining({ name: "+10 mesas" })]);
  });

  it("sem plano, sem limite; com o Essencial, até a mesa 10; o pacote libera até a 20", async () => {
    await como(dono).post("/api/tabs").send({ tableNumber: 300 }).expect(201); // sem plano

    await assinar();
    await como(dono).post("/api/tabs").send({ tableNumber: 10 }).expect(201);
    const recusa = await como(dono).post("/api/tabs").send({ tableNumber: 11 }).expect(403);
    expect(recusa.body.message).toBe("Seu plano permite até a mesa 10. Fale com a MesaFlow para aumentar.");
    await como(dono).post("/api/tabs").send({ label: "Balcão — Ana" }).expect(201); // sem número não conta
    await como(dono).post("/api/tabs/table/11/rounds").send({ clientRequestId: randomUUID(), items: [] }).expect(400);
    await como(dono).get("/api/table-codes?from=1&to=10").expect(200);
    await como(dono).get("/api/table-codes?from=5&to=11").expect(403);
    await como(dono).post("/api/table-codes/11/regenerate").expect(403);

    await assinar([{ addonId: maisMesas.id, quantity: 1 }]);
    await como(dono).post("/api/tabs").send({ tableNumber: 20 }).expect(201);
    await como(dono).post("/api/tabs").send({ tableNumber: 21 }).expect(403);
    const plano = companyPlanSchema.parse((await como(dono).get("/api/company/plan").expect(200)).body);
    expect(plano).toMatchObject({ plan: "Essencial", limits: { tables: 20, members: 3, products: null }, addons: [{ name: "+10 mesas", quantity: 1 }] });
  });

  it("equipe: até 3 pessoas contando o dono; a 4ª é recusada sem criar login", async () => {
    await assinar();
    await como(dono).post("/api/members").send(pessoa(1)).expect(201);
    await como(dono).post("/api/members").send(pessoa(2)).expect(201);
    const recusa = await como(dono).post("/api/members").send(pessoa(3)).expect(403);
    expect(recusa.body.message).toBe("Seu plano permite até 3 pessoas na equipe. Fale com a MesaFlow para aumentar.");
    expect(usuarios.has("p3@x.com")).toBe(false);
    expect((await como(dono).get("/api/company/plan")).body.usage.members).toBe(3);
  });

  it("dois cadastros ao mesmo tempo na última vaga: só um entra", async () => {
    await assinar();
    await como(dono).post("/api/members").send(pessoa(1)).expect(201); // dono + 1 = 2 de 3
    const [a, b] = await Promise.all([como(dono).post("/api/members").send(pessoa(2)), como(dono).post("/api/members").send(pessoa(3))]);
    expect([a.status, b.status].sort()).toEqual([201, 403]);
    expect((await como(dono).get("/api/members")).body).toHaveLength(3);
  });

  it("produtos: limite conta também os inativos", async () => {
    await mudarPlano({ limits: { tables: 10, members: 3, products: 2 } });
    await assinar();
    const cat = (await como(dono).post("/api/catalog/categories").send({ name: "Tudo" }).expect(201)).body.id;
    await como(dono).post("/api/catalog/products").send({ categoryId: cat, name: "A", priceCents: 100 }).expect(201);
    await como(dono).post("/api/catalog/products").send({ categoryId: cat, name: "B", priceCents: 100, active: false }).expect(201);
    const recusa = await como(dono).post("/api/catalog/products").send({ categoryId: cat, name: "C", priceCents: 100 }).expect(403);
    expect(recusa.body.message).toContain("até 2 produtos no cardápio");
  });

  it("recurso desligado: some do perfil e a API recusa, inclusive as páginas públicas", async () => {
    await assinar();
    const qr = (await como(dono).get("/api/table-codes?from=1&to=1").expect(200)).body[0].token as string;
    await http().get(`/api/table/${qr}`).expect(200);
    await http().get(`/api/storefront/${codigo}`).expect(200);

    await mudarPlano({ modules: { tabs: false, stock: false, storefront: false } });
    expect((await como(dono).get("/api/auth/me").expect(200)).body.company.modules).toEqual({ tabs: false, stock: false, storefront: false });
    const mesas = await como(dono).get("/api/tabs").expect(403);
    expect(mesas.body.message).toBe("Seu plano não inclui mesas e comandas. Fale com a MesaFlow para liberar.");
    await como(dono).post("/api/tabs/table/1/rounds").send({ clientRequestId: randomUUID(), items: [] }).expect(403);
    await como(dono).get("/api/table-codes?from=1&to=1").expect(403);
    await como(dono).get("/api/waiter-calls").expect(403);
    await como(dono).get("/api/stock/ingredients").expect(403);
    await http().get(`/api/table/${qr}`).expect(404);
    await http().get(`/api/storefront/${codigo}`).expect(404);
    // Balcão e cardápio continuam.
    await como(dono).get("/api/orders/menu").expect(200);
  });

  it("fatura do mês soma plano e pacotes, com o detalhe; o esperado do mês também", async () => {
    await assinar([{ addonId: maisMesas.id, quantity: 2 }]);
    await como(admin).post("/api/admin/billing/generate").send({ month: "2026-12" }).expect(200);
    const mes = (await como(admin).get("/api/admin/billing?month=2026-12").expect(200)).body as {
      rows: { company: { id: string }; invoice: { amountCents: number; items: unknown[] }; subscription: { addons: unknown[] } }[];
    };
    const linha = mes.rows.find((r) => r.company.id === empresa)!;
    expect(linha.invoice.amountCents).toBe(4990 + 2 * 3000);
    expect(linha.invoice.items).toEqual([
      { description: "Plano Essencial", amountCents: 4990 },
      { description: "+10 mesas (2 pacotes)", amountCents: 6000 },
    ]);
    expect(linha.subscription.addons).toEqual([expect.objectContaining({ name: "+10 mesas", quantity: 2, unitPriceCents: 3000 })]);
    expect((await como(admin).get("/api/admin/companies/overview").expect(200)).body.expectedMonthlyCents).toBe(4990 + 6000);

    // Mudar o valor do pacote: quem já tem fica no valor dele, a menos que se aplique a todos.
    const corpo = { name: "+10 mesas", resource: "tables", amount: 10, priceCents: 3500, active: true };
    expect((await como(admin).put(`/api/admin/addons/${maisMesas.id}`).send(corpo).expect(200)).body.updatedSubscriptions).toBe(0);
    await assinar([{ addonId: maisMesas.id, quantity: 3 }]); // continua com o valor combinado
    const sub = (await como(admin).get("/api/admin/billing?month=2026-12")).body.rows.find((r: { company: { id: string } }) => r.company.id === empresa).subscription;
    expect(sub.addons[0]).toMatchObject({ quantity: 3, unitPriceCents: 3000 });
    expect((await como(admin).put(`/api/admin/addons/${maisMesas.id}`).send({ ...corpo, applyPriceToSubscribers: true }).expect(200)).body.updatedSubscriptions).toBe(1);
    await assinar([]); // tira o pacote
    expect((await como(dono).get("/api/company/plan")).body.limits.tables).toBe(10);
  });

  it("só a equipe MesaFlow mexe nos adicionais", async () => {
    await como(dono).get("/api/admin/addons").expect(403);
    await como(dono).post("/api/admin/addons").send({ name: "Grátis", resource: "tables", amount: 99, priceCents: 1 }).expect(403);
    await como(admin).post("/api/admin/addons").send({ name: "+10 MESAS", resource: "tables", amount: 10, priceCents: 1 }).expect(409);
    await como(admin).post("/api/admin/addons").send({ name: "Pacote X", resource: "cadeiras", amount: 1, priceCents: 1 }).expect(400);
  });
});
