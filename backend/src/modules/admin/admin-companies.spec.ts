import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "drizzle-orm";
import { adminCompanyCreatedSchema, adminCompanySchema, type AdminCompany } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { AuthAdmin } from "../../auth/supabase-admin.client.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { platformAdmins } from "../../db/schema.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";

describe("Admin: restaurantes", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;
  let admin: string;
  let donoExistente: string;
  let codigoExistente: string;

  const usuarios = new Map<string, string>();
  let falharBanco = false;
  const authAdmin: AuthAdmin = {
    async createUser(email) {
      if (usuarios.has(email)) throw new ConflictException("Este e-mail já tem acesso ao MesaFlow. Use outro e-mail.");
      const id = randomUUID();
      await banco.db.execute(sql`insert into auth.users (id) values (${id})`);
      usuarios.set(email, id);
      // Simula o banco falhando depois do login criado: o restaurante não pode ficar pela metade.
      if (falharBanco) await banco.db.execute(sql`delete from auth.users where id = ${id}`);
      return id;
    },
    async deleteUser(id) {
      for (const [email, u] of usuarios) if (u === id) usuarios.delete(email);
    },
    async passwordToken(email) {
      return `tk_${usuarios.get(email) ?? "x"}`;
    },
  };

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${token}`),
    put: (url: string) => http().put(url).set("Authorization", `Bearer ${token}`),
  });
  const novo = (extra: Record<string, unknown> = {}) => ({
    name: "Pizzaria do Zé",
    ownerName: "José Silva",
    ownerCpf: "529.982.247-25",
    ownerEmail: "ZE@pizzaria.com",
    address: { cep: "01310-100", street: "Avenida Paulista", number: "1000", complement: "Loja 2", district: "Bela Vista", city: "São Paulo", state: "sp" },
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
    falharBanco = false;
    const adminId = randomUUID();
    await banco.db.execute(sql`insert into auth.users (id) values (${adminId})`);
    await banco.db.insert(platformAdmins).values({ authUserId: adminId, name: "Admin", email: "admin@mesaflow.com" });
    admin = await emitir(adminId);
    const r = await criarRestaurante(banco, { nome: "Cantina Antiga" });
    donoExistente = await emitir(r.authUserId);
    codigoExistente = (await como(donoExistente).get("/api/auth/me")).body.company.code;
  });

  it("cadastra restaurante com dono e link de senha, e lista com os números de uso", async () => {
    const r = adminCompanyCreatedSchema.parse((await como(admin).post("/api/admin/companies").send(novo()).expect(201)).body);
    expect(r.company).toMatchObject({
      name: "Pizzaria do Zé",
      status: "active",
      owner: { name: "José Silva", email: "ze@pizzaria.com" },
      address: { cep: "01310100", street: "Avenida Paulista", number: "1000", complement: "Loja 2", district: "Bela Vista", city: "São Paulo", state: "SP" },
      membersCount: 1,
      ordersLast30Days: 0,
      lastOrderAt: null,
    });
    expect(r.company.code).toMatch(/^\d{6}$/);
    expect(r.company.code).not.toBe(codigoExistente);
    expect(r.token).toBe(`tk_${usuarios.get("ze@pizzaria.com")}`);

    // O dono entra no painel do restaurante novo como owner.
    const dono = await emitir(usuarios.get("ze@pizzaria.com")!);
    const me = (await como(dono).get("/api/auth/me").expect(200)).body;
    expect(me).toMatchObject({ member: { role: "owner" }, company: { code: r.company.code } });

    const lista = adminCompanySchema.array().parse((await como(admin).get("/api/admin/companies").expect(200)).body);
    expect(lista.map((c: AdminCompany) => c.name).sort()).toEqual(["Cantina Antiga", "Pizzaria do Zé"]);

    const link = await como(admin).post(`/api/admin/companies/${r.company.id}/owner-link`).expect(201);
    expect(link.body.token).toBeTruthy();
  });

  it("e-mail repetido dá 409, dados inválidos dá 400 e falha no banco não deixa login órfão", async () => {
    await como(admin).post("/api/admin/companies").send(novo()).expect(201);
    await como(admin).post("/api/admin/companies").send(novo({ name: "Outra" })).expect(409);
    await como(admin).post("/api/admin/companies").send(novo({ ownerCpf: "1", ownerEmail: "x" })).expect(400);
    const semEndereco = await como(admin).post("/api/admin/companies").send(novo({ ownerEmail: "sem@x.com", address: undefined })).expect(400);
    expect(semEndereco.body.issues.some((i: { path: string }) => i.path.startsWith("address"))).toBe(true);
    await como(admin)
      .post("/api/admin/companies")
      .send(novo({ ownerEmail: "uf@x.com", address: { cep: "123", street: "R", number: "", district: "B", city: "C", state: "XX" } }))
      .expect(400);

    falharBanco = true;
    await como(admin).post("/api/admin/companies").send(novo({ ownerEmail: "falha@x.com" })).expect(500);
    expect(usuarios.has("falha@x.com")).toBe(false);
    expect((await como(admin).get("/api/admin/companies")).body).toHaveLength(2);
  });

  it("bloquear derruba painel e cardápio online na hora; desbloquear volta", async () => {
    const [c] = ((await como(admin).get("/api/admin/companies")).body as AdminCompany[]).filter((x) => x.code === codigoExistente);
    await como(admin).put(`/api/admin/companies/${c!.id}/status`).send({ status: "blocked" }).expect(400); // sem motivo
    const b = await como(admin).put(`/api/admin/companies/${c!.id}/status`).send({ status: "blocked", reason: "Mensalidade em atraso" }).expect(200);
    expect(b.body).toMatchObject({ status: "blocked", blockedReason: "Mensalidade em atraso" });

    const painel = await como(donoExistente).get("/api/auth/me").expect(403);
    expect(painel.body.message).toBe("Restaurante bloqueado: Mensalidade em atraso");
    await http().get(`/api/storefront/${codigoExistente}`).expect(404);

    await como(admin).put(`/api/admin/companies/${c!.id}/status`).send({ status: "active" }).expect(200);
    await como(donoExistente).get("/api/auth/me").expect(200);
    await http().get(`/api/storefront/${codigoExistente}`).expect(200);
  });

  it("completa o endereço de um restaurante antigo", async () => {
    const [c] = ((await como(admin).get("/api/admin/companies")).body as AdminCompany[]).filter((x) => x.code === codigoExistente);
    expect(c!.address).toBeNull();
    const r = await como(admin)
      .put(`/api/admin/companies/${c!.id}/address`)
      .send({ cep: "90010-000", street: "Rua dos Andradas", number: "S/N", district: "Centro Histórico", city: "Porto Alegre", state: "RS" })
      .expect(200);
    expect(r.body.address).toEqual({ cep: "90010000", street: "Rua dos Andradas", number: "S/N", complement: "", district: "Centro Histórico", city: "Porto Alegre", state: "RS" });
    await como(admin).put(`/api/admin/companies/${c!.id}/address`).send({ cep: "9" }).expect(400);
    await como(admin).put(`/api/admin/companies/${randomUUID()}/address`).send({ cep: "90010-000", street: "Rua A", number: "1", district: "Centro", city: "Porto Alegre", state: "RS" }).expect(404);
    await como(donoExistente).put(`/api/admin/companies/${c!.id}/address`).send({}).expect(403);
  });

  it("só a equipe MesaFlow entra; id desconhecido dá 404", async () => {
    await como(donoExistente).get("/api/admin/companies").expect(403);
    await como(donoExistente).post("/api/admin/companies").send(novo()).expect(403);
    await http().get("/api/admin/companies").expect(401);
    await como(admin).put(`/api/admin/companies/${randomUUID()}/status`).send({ status: "active" }).expect(404);
    await como(admin).post(`/api/admin/companies/nao-e-id/owner-link`).expect(404);
  });
});
