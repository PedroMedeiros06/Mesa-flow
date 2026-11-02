import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Controller, Get, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { memberSessionSchema, type AdminProfile, type MemberProfile, type Permission } from "@mesaflow/shared";
import { AppModule } from "../app.module.js";
import { configureApp } from "../configure-app.js";
import { CurrentMember, RequirePermission } from "./auth-context.js";
import { MemberGuard } from "./guards.js";
import { IdentityRepository, type MemberIdentity } from "./identity.repository.js";
import { SupabaseAuthClient, type AuthSession } from "./supabase-auth.client.js";
import { TokenVerifier } from "./token-verifier.js";
import { criarEmissorDeTokens, ISSUER_TESTE } from "../testing/tokens.js";
import { UseGuards } from "@nestjs/common";

// Rota só de teste: exige uma permissão e devolve o restaurante que o guard leu do banco.
@Controller("teste")
@UseGuards(MemberGuard)
class RotaDeTeste {
  @Get("pedidos")
  @RequirePermission("orders.create")
  pedidos(@CurrentMember() m: MemberProfile) {
    return { companyId: m.company.id };
  }
}

// ---------- dados em memória ----------
type Pessoa = {
  authUserId: string;
  email: string;
  password: string;
  companyCode: string;
  cpf: string;
  identity: MemberIdentity;
};

const empresaA = { id: "11111111-1111-4111-8111-111111111111", code: "100001", name: "Cantina A" };
const empresaB = { id: "22222222-2222-4222-8222-222222222222", code: "200002", name: "Bistrô B" };

function pessoa(
  id: string,
  empresa: typeof empresaA,
  role: "owner" | "employee",
  permissions: Permission[],
  extra: Partial<MemberIdentity> = {},
): Pessoa {
  return {
    authUserId: id,
    email: `${id}@teste.com`,
    password: "senha-certa",
    companyCode: empresa.code,
    // CPF único por pessoa: os 11 últimos dígitos do id.
    cpf: id.replace(/\D/g, "").slice(-11),
    identity: {
      profile: {
        kind: "member",
        member: { id, name: `Pessoa ${id.slice(-4)}`, email: `${id}@teste.com`, role, permissions },
        company: empresa,
      },
      memberActive: true,
      companyActive: true,
      blockedReason: null,
      ...extra,
    },
  };
}

const donoA = pessoa("aaaa0000-0000-4000-8000-000000000001", empresaA, "owner", []);
const caixaA = pessoa("aaaa0000-0000-4000-8000-000000000002", empresaA, "employee", ["orders.create"]);
const garcomA = pessoa("aaaa0000-0000-4000-8000-000000000003", empresaA, "employee", ["tabs.view"]);
const donoB = pessoa("bbbb0000-0000-4000-8000-000000000004", empresaB, "owner", []);
const bloqueadoB = pessoa("bbbb0000-0000-4000-8000-000000000005", empresaB, "employee", [], {
  companyActive: false,
  blockedReason: "mensalidade em atraso",
});
const admin: AdminProfile = {
  kind: "admin",
  admin: { id: "cccc0000-0000-4000-8000-000000000006", name: "Admin", email: "admin@mesaflow.com" },
};
const adminAuthId = "cccc0000-0000-4000-8000-000000000099";

const pessoas = [donoA, caixaA, garcomA, donoB, bloqueadoB];

class IdentidadesEmMemoria extends IdentityRepository {
  async findLoginEmail(code: string, cpf: string) {
    return pessoas.find((p) => p.companyCode === code && p.cpf === cpf)?.email ?? null;
  }
  async findMemberByAuthUser(id: string) {
    return pessoas.find((p) => p.authUserId === id)?.identity ?? null;
  }
  async findAdminByAuthUser(id: string) {
    return id === adminAuthId ? admin : null;
  }
}

// ---------- tokens assinados com chave local ----------
let token: Awaited<ReturnType<typeof criarEmissorDeTokens>>["token"];
let verifier: TokenVerifier;

const signOuts: string[] = [];

class AuthFalso extends SupabaseAuthClient {
  override async signInWithPassword(email: string, password: string): Promise<AuthSession | null> {
    const id =
      email === admin.admin.email && password === "senha-certa"
        ? adminAuthId
        : pessoas.find((p) => p.email === email && p.password === password)?.authUserId;
    if (!id) return null;
    return { userId: id, accessToken: await token(id), refreshToken: `r-${id}`, expiresAt: 0 };
  }
  override async refresh(): Promise<AuthSession | null> {
    return null;
  }
  override async signOut(accessToken: string): Promise<void> {
    signOuts.push(accessToken);
  }
}

describe("autenticação e permissões", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ verifier, token } = await criarEmissorDeTokens());

    const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [RotaDeTeste] })
      .overrideProvider(TokenVerifier)
      .useValue(verifier)
      .overrideProvider(IdentityRepository)
      .useValue(new IdentidadesEmMemoria())
      .overrideProvider(SupabaseAuthClient)
      .useValue(new AuthFalso())
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    signOuts.length = 0;
  });

  describe("login do restaurante", () => {
    it("entra com código + CPF + senha e devolve o perfil", async () => {
      const res = await http()
        .post("/api/auth/login")
        .send({ companyCode: donoA.companyCode, cpf: donoA.cpf, password: "senha-certa" })
        .expect(200);
      const sessao = memberSessionSchema.parse(res.body);
      expect(sessao.profile.company.id).toBe(empresaA.id);
    });

    it("dá a mesma resposta para código inexistente e senha errada", async () => {
      const semEmpresa = await http()
        .post("/api/auth/login")
        .send({ companyCode: "999999", cpf: donoA.cpf, password: "senha-certa" })
        .expect(401);
      const senhaErrada = await http()
        .post("/api/auth/login")
        .send({ companyCode: donoA.companyCode, cpf: donoA.cpf, password: "errada" })
        .expect(401);
      expect(semEmpresa.body.message).toBe(senhaErrada.body.message);
    });

    it("só conta que o restaurante está bloqueado depois da senha certa, e encerra a sessão", async () => {
      const senhaErrada = await http()
        .post("/api/auth/login")
        .send({ companyCode: bloqueadoB.companyCode, cpf: bloqueadoB.cpf, password: "errada" })
        .expect(401);
      expect(senhaErrada.body.message).not.toMatch(/bloqueado/);

      const res = await http()
        .post("/api/auth/login")
        .send({ companyCode: bloqueadoB.companyCode, cpf: bloqueadoB.cpf, password: "senha-certa" })
        .expect(403);
      expect(res.body.message).toContain("mensalidade em atraso");
      expect(signOuts).toHaveLength(1);
    });

    it("recusa corpo inválido com 400 e lista os campos", async () => {
      const res = await http().post("/api/auth/login").send({ companyCode: "12", cpf: "1" }).expect(400);
      expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(
        expect.arrayContaining(["companyCode", "cpf", "password"]),
      );
    });
  });

  describe("token", () => {
    it("sem token, token inválido, expirado ou de outro emissor = 401", async () => {
      await http().get("/api/auth/me").expect(401);
      await http().get("/api/auth/me").set("Authorization", "Bearer lixo").expect(401);
      const expirado = await token(donoA.authUserId, { expiresIn: "-1m" });
      await http().get("/api/auth/me").set("Authorization", `Bearer ${expirado}`).expect(401);
      const outroEmissor = await token(donoA.authUserId, { issuer: "https://outro.supabase.co/auth/v1" });
      await http().get("/api/auth/me").set("Authorization", `Bearer ${outroEmissor}`).expect(401);
    });

    it("token válido de usuário que não é membro = 401", async () => {
      const t = await token("dddd0000-0000-4000-8000-000000000000");
      await http().get("/api/auth/me").set("Authorization", `Bearer ${t}`).expect(401);
    });

    it("/me devolve o perfil lido do banco", async () => {
      const t = await token(caixaA.authUserId);
      const res = await http().get("/api/auth/me").set("Authorization", `Bearer ${t}`).expect(200);
      expect(res.body.member.permissions).toEqual(["orders.create"]);
    });
  });

  describe("permissões", () => {
    const pedidos = async (p: Pessoa) =>
      http()
        .get("/api/teste/pedidos?companyId=" + empresaB.id)
        .set("Authorization", `Bearer ${await token(p.authUserId)}`);

    it("funcionário com a permissão passa; sem ela leva 403", async () => {
      expect((await pedidos(caixaA)).status).toBe(200);
      expect((await pedidos(garcomA)).status).toBe(403);
    });

    it("dono passa sem precisar da permissão na lista", async () => {
      expect((await pedidos(donoA)).status).toBe(200);
    });

    it("o restaurante vem da sessão, nunca da URL", async () => {
      const res = await pedidos(caixaA);
      expect(res.body.companyId).toBe(empresaA.id);
    });

    it("restaurante bloqueado leva 403 mesmo com token válido", async () => {
      expect((await pedidos(bloqueadoB)).status).toBe(403);
    });
  });

  describe("admin", () => {
    it("admin entra e acessa /admin/auth/me", async () => {
      const login = await http()
        .post("/api/admin/auth/login")
        .send({ email: admin.admin.email, password: "senha-certa" })
        .expect(200);
      await http()
        .get("/api/admin/auth/me")
        .set("Authorization", `Bearer ${login.body.accessToken}`)
        .expect(200);
    });

    it("membro de restaurante não entra na área admin", async () => {
      const t = await token(donoA.authUserId);
      await http().get("/api/admin/auth/me").set("Authorization", `Bearer ${t}`).expect(403);
      await http().post("/api/admin/auth/login").send({ email: donoA.email, password: "senha-certa" }).expect(401);
      expect(signOuts).toHaveLength(1);
    });

    it("admin não entra no painel do restaurante", async () => {
      const t = await token(adminAuthId);
      await http().get("/api/auth/me").set("Authorization", `Bearer ${t}`).expect(401);
    });
  });
});
