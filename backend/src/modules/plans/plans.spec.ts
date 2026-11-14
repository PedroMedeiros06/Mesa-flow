import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "drizzle-orm";
import { adminPlanSchema, publicPlanSchema, type AdminPlan } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { platformAdmins } from "../../db/schema.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";

describe("Catálogo de planos", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;
  let admin: string;
  let dono: string;
  let empresaA: string;
  let empresaB: string;

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${token}`),
    put: (url: string) => http().put(url).set("Authorization", `Bearer ${token}`),
  });
  const lista = async () => adminPlanSchema.array().parse((await como(admin).get("/api/admin/plans").expect(200)).body);
  const plano = async (nome: string) => (await lista()).find((p) => p.name === nome)!;
  const corpo = (p: AdminPlan, extra: Record<string, unknown> = {}) => ({
    name: p.name,
    priceCents: p.priceCents,
    description: p.description,
    features: p.features,
    highlighted: p.highlighted,
    active: p.active,
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
    // Planos voltam aos dois que a migração cria, com os valores originais.
    await banco.db.execute(sql`update app.plans set price_cents = 4990, active = true, highlighted = false, position = 1 where name = 'Essencial'`);
    await banco.db.execute(sql`update app.plans set price_cents = 9990, active = true, highlighted = true, position = 2 where name = 'Completo'`);
    await banco.db.execute(sql`delete from app.plans where name not in ('Essencial', 'Completo')`);
    const adminId = randomUUID();
    await banco.db.execute(sql`insert into auth.users (id) values (${adminId})`);
    await banco.db.insert(platformAdmins).values({ authUserId: adminId, name: "Admin", email: "admin@mesaflow.com" });
    admin = await emitir(adminId);
    const a = await criarRestaurante(banco);
    const b = await criarRestaurante(banco);
    empresaA = a.companyId;
    empresaB = b.companyId;
    dono = await emitir(a.authUserId);
  });

  it("o site mostra os planos ativos na ordem, com os dois que vieram do site antigo", async () => {
    const site = publicPlanSchema.array().parse((await http().get("/api/plans").expect(200)).body);
    expect(site.map((p) => [p.name, p.priceCents, p.highlighted])).toEqual([
      ["Essencial", 4990, false],
      ["Completo", 9990, true],
    ]);
    expect(site[1]!.features).toContain("Mesas e comandas com divisão da conta");
  });

  it("cria, reordena, destaca um só e desativado some do site", async () => {
    const novo = await como(admin)
      .post("/api/admin/plans")
      .send({ name: "Rede", priceCents: 19990, description: "Para várias unidades", features: ["Tudo do Completo", "Suporte prioritário"], highlighted: true })
      .expect(201);
    expect(novo.body).toMatchObject({ updatedSubscriptions: 0, plan: { name: "Rede", position: 3, highlighted: true, active: true } });
    expect((await lista()).filter((p) => p.highlighted).map((p) => p.name)).toEqual(["Rede"]);

    await como(admin).post("/api/admin/plans").send({ name: "rede", priceCents: 100 }).expect(409); // nome repetido
    await como(admin).post("/api/admin/plans").send({ name: "X", priceCents: 0 }).expect(400);

    const [e, c, r] = await lista();
    await como(admin).put("/api/admin/plans/order").send({ ids: [r!.id, e!.id, c!.id] }).expect(200);
    await como(admin).put(`/api/admin/plans/${c!.id}`).send(corpo(c!, { active: false, highlighted: false })).expect(200);
    const site = (await http().get("/api/plans").expect(200)).body as { name: string }[];
    expect(site.map((p) => p.name)).toEqual(["Rede", "Essencial"]);
  });

  it("valor novo: só para novos clientes ou para todos do plano; nome novo vai para todos", async () => {
    const completo = await plano("Completo");
    await como(admin).put(`/api/admin/companies/${empresaA}/subscription`).send({ planId: completo.id, priceCents: 9990, dueDay: 10 }).expect(200);
    await como(admin).put(`/api/admin/companies/${empresaB}/subscription`).send({ planId: completo.id, priceCents: 8990, dueDay: 10 }).expect(200);
    expect(await plano("Completo")).toMatchObject({ subscribers: 2, subscribersWithOtherPrice: 1 });

    // Só para novos: quem já é cliente fica no valor dele, mas o nome muda para todos.
    const r1 = await como(admin).put(`/api/admin/plans/${completo.id}`).send(corpo(completo, { name: "Completo+", priceCents: 11990 })).expect(200);
    expect(r1.body.updatedSubscriptions).toBe(0);
    const cob = (await como(admin).get("/api/admin/billing").expect(200)).body as { rows: { company: { id: string }; subscription: { plan: string; priceCents: number } }[] };
    const sub = (id: string) => cob.rows.find((x) => x.company.id === id)!.subscription;
    expect(sub(empresaA)).toMatchObject({ plan: "Completo+", priceCents: 9990 });

    // Para todos: as duas assinaturas vão para o valor novo.
    const atual = await plano("Completo+");
    const r2 = await como(admin)
      .put(`/api/admin/plans/${completo.id}`)
      .send(corpo(atual, { priceCents: 12990, applyPriceToSubscribers: true }))
      .expect(200);
    expect(r2.body).toMatchObject({ updatedSubscriptions: 2, plan: { subscribersWithOtherPrice: 0 } });
  });

  it("só a equipe MesaFlow mexe no catálogo", async () => {
    const e = await plano("Essencial");
    await como(dono).get("/api/admin/plans").expect(403);
    await como(dono).post("/api/admin/plans").send({ name: "Grátis", priceCents: 1 }).expect(403);
    await como(dono).put(`/api/admin/plans/${e.id}`).send(corpo(e, { priceCents: 1 })).expect(403);
    await como(admin).put(`/api/admin/plans/${randomUUID()}`).send(corpo(e, { name: "Outro" })).expect(404);
  });
});
