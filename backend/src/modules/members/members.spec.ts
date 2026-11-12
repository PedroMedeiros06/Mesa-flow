import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "drizzle-orm";
import { memberCreatedSchema, memberSchema, type Member } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { AuthAdmin } from "../../auth/supabase-admin.client.js";
import { SupabaseAuthClient } from "../../auth/supabase-auth.client.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarPessoa, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";

describe("Equipe e link de senha", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;

  // Supabase Auth de mentira: guarda e-mails, tokens de senha e as senhas gravadas.
  const usuarios = new Map<string, string>(); // e-mail -> authUserId
  const tokens = new Map<string, string>(); // token -> authUserId
  const senhas = new Map<string, string>(); // authUserId -> senha
  let falharLink = false;
  const authAdmin: AuthAdmin = {
    async createUser(email) {
      if (usuarios.has(email)) throw new ConflictException("Este e-mail já tem acesso ao MesaFlow. Use outro e-mail.");
      const id = randomUUID();
      await banco.db.execute(sql`insert into auth.users (id) values (${id})`);
      usuarios.set(email, id);
      return id;
    },
    async deleteUser(id) {
      for (const [email, u] of usuarios) if (u === id) usuarios.delete(email);
    },
    async passwordToken(email) {
      if (falharLink) throw new Error("fora do ar");
      const token = `tk_${randomUUID()}`;
      tokens.set(token, usuarios.get(email)!);
      return token;
    },
  };
  const authClient = {
    async verifyPasswordToken(token: string) {
      const userId = tokens.get(token);
      tokens.delete(token); // vale uma vez só
      return userId ? { userId, accessToken: `at_${userId}`, refreshToken: "r", expiresAt: 0 } : null;
    },
    async updatePassword(accessToken: string, password: string) {
      senhas.set(accessToken.slice(3), password);
      return null;
    },
    async signOut() {},
  };

  let dono: string;
  let gerente: string; // members.manage + orders.view
  let garcom: string; // tabs.view
  let donoB: string;
  let idDono: string;
  let idGerente: string;

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${token}`),
    patch: (url: string) => http().patch(url).set("Authorization", `Bearer ${token}`),
  });
  const novo = (extra: Record<string, unknown> = {}) => ({
    name: "Joana Garçonete",
    cpf: "529.982.247-25",
    email: "Joana@Exemplo.com ",
    permissions: ["tabs.view", "tabs.open"],
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
      .overrideProvider(SupabaseAuthClient)
      .useValue(authClient)
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
    tokens.clear();
    senhas.clear();
    falharLink = false;
    const a = await criarRestaurante(banco, { nome: "Cantina da Nona" });
    idDono = a.memberId;
    const g = await criarPessoa(banco, a.companyId, { permissions: ["members.manage", "orders.view"] });
    const w = await criarPessoa(banco, a.companyId, { permissions: ["tabs.view"] });
    const b = await criarRestaurante(banco);
    dono = await emitir(a.authUserId);
    gerente = await emitir(g.authUserId);
    garcom = await emitir(w.authUserId);
    donoB = await emitir(b.authUserId);
    const lista = (await como(dono).get("/api/members").expect(200)).body as Member[];
    idGerente = lista.find((m) => m.permissions.includes("members.manage"))!.id;
  });

  it("lista a equipe com o dono primeiro e só para quem gerencia a equipe", async () => {
    const lista = memberSchema.array().parse((await como(dono).get("/api/members").expect(200)).body);
    expect(lista).toHaveLength(3);
    expect(lista[0]!.role).toBe("owner");
    await como(garcom).get("/api/members").expect(403);
    // Outro restaurante só vê a própria equipe.
    expect((await como(donoB).get("/api/members").expect(200)).body).toHaveLength(1);
  });

  it("cadastra funcionário com link de senha, e o link define a senha uma vez só", async () => {
    const r = memberCreatedSchema.parse((await como(dono).post("/api/members").send(novo()).expect(201)).body);
    expect(r.member).toMatchObject({
      name: "Joana Garçonete",
      cpf: "52998224725",
      email: "joana@exemplo.com",
      role: "employee",
      permissions: ["tabs.view", "tabs.open"],
      status: "active",
    });
    expect(r.token).toBeTruthy();

    const ok = await http().post("/api/auth/password").send({ token: r.token, password: "senha-nova-123" }).expect(200);
    expect(ok.body).toEqual({ name: "Joana Garçonete", companyCode: expect.any(String), companyName: "Cantina da Nona" });
    expect(senhas.get(usuarios.get("joana@exemplo.com")!)).toBe("senha-nova-123");

    await http().post("/api/auth/password").send({ token: r.token, password: "outra-senha-123" }).expect(400);
    await http().post("/api/auth/password").send({ token: r.token, password: "curta" }).expect(400);
  });

  it("recusa CPF repetido no restaurante, e-mail já usado e dados inválidos", async () => {
    await como(dono).post("/api/members").send(novo()).expect(201);
    await como(dono).post("/api/members").send(novo({ email: "outra@exemplo.com" })).expect(409);
    // O CPF repetido não deixa login órfão no Auth.
    expect(usuarios.has("outra@exemplo.com")).toBe(false);
    await como(donoB).post("/api/members").send(novo({ cpf: "11144477735" })).expect(409); // e-mail já usado
    await como(dono).post("/api/members").send(novo({ cpf: "123", email: "x" })).expect(400);
    await como(dono).post("/api/members").send(novo({ cpf: "11144477735", email: "y@x.com", permissions: ["tudo"] })).expect(400);
  });

  it("se o link falhar, a pessoa entra na equipe e o link sai depois", async () => {
    falharLink = true;
    const r = (await como(dono).post("/api/members").send(novo()).expect(201)).body;
    expect(r.token).toBeNull();
    falharLink = false;
    const l = await como(dono).post(`/api/members/${r.member.id}/password-link`).expect(201);
    expect(l.body.token).toBeTruthy();
  });

  it("gerente só dá ou tira permissões que ele tem; ninguém mexe no dono nem em si mesmo", async () => {
    await como(gerente).post("/api/members").send(novo({ permissions: ["company.manage"] })).expect(403);
    const r = (await como(gerente).post("/api/members").send(novo({ permissions: ["orders.view"] })).expect(201)).body;

    const p = await como(gerente).patch(`/api/members/${r.member.id}`).send({ permissions: [] }).expect(200);
    expect(p.body.permissions).toEqual([]);

    // Joana ganhou "tabs.view" do dono: agora tem algo que o gerente não tem, e o gerente
    // não pode mais editar, bloquear nem gerar o link de senha dela (senão entraria como ela).
    await como(dono).patch(`/api/members/${r.member.id}`).send({ permissions: ["orders.view", "tabs.view"] }).expect(200);
    await como(gerente).patch(`/api/members/${r.member.id}`).send({ permissions: ["orders.view", "tabs.view"] }).expect(403);
    await como(gerente).patch(`/api/members/${r.member.id}`).send({ status: "blocked" }).expect(403);
    await como(gerente).post(`/api/members/${r.member.id}/password-link`).expect(403);

    await como(gerente).patch(`/api/members/${idDono}`).send({ status: "blocked" }).expect(403);
    await como(gerente).post(`/api/members/${idDono}/password-link`).expect(403);
    await como(gerente).patch(`/api/members/${idGerente}`).send({ permissions: ["members.manage", "orders.view", "orders.create"] }).expect(403);
    await como(dono).patch(`/api/members/${idDono}`).send({ name: "Outro" }).expect(403);
    // O próprio link de senha pode.
    await como(dono).post(`/api/members/${idDono}/password-link`).expect(201);
  });

  it("bloquear vale na hora e impede o link; outro restaurante recebe 404", async () => {
    const r = (await como(dono).post("/api/members").send(novo()).expect(201)).body;
    const joana = await emitir(usuarios.get("joana@exemplo.com")!);
    await como(joana).get("/api/tabs").expect(200);

    await como(donoB).patch(`/api/members/${r.member.id}`).send({ status: "blocked" }).expect(404);
    await como(donoB).post(`/api/members/${r.member.id}/password-link`).expect(404);
    await como(dono).patch(`/api/members/nao-e-id`).send({ status: "blocked" }).expect(404);

    await como(dono).patch(`/api/members/${r.member.id}`).send({ status: "blocked" }).expect(200);
    await como(joana).get("/api/tabs").expect(403);
    await como(dono).post(`/api/members/${r.member.id}/password-link`).expect(409);
    // Link gerado antes do bloqueio também não serve.
    await http().post("/api/auth/password").send({ token: r.token, password: "senha-nova-123" }).expect(403);

    await como(dono).patch(`/api/members/${r.member.id}`).send({ status: "active" }).expect(200);
    await como(joana).get("/api/tabs").expect(200);
  });
});
