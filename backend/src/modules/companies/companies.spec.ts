import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../app.module.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarPessoa, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";

describe("Ajustes do restaurante", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;
  let dono: string;
  let garcom: string;
  let donoB: string;
  let codigo: string;

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    put: (url: string) => http().put(url).set("Authorization", `Bearer ${token}`),
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
    const a = await criarRestaurante(banco, { nome: "Cantina da Nona" });
    const g = await criarPessoa(banco, a.companyId, { permissions: ["tabs.view"] });
    const b = await criarRestaurante(banco, { nome: "Bistrô B" });
    dono = await emitir(a.authUserId);
    garcom = await emitir(g.authUserId);
    donoB = await emitir(b.authUserId);
    codigo = (await como(dono).get("/api/company").expect(200)).body.code;
  });

  it("salva os dados normalizados e o cardápio online mostra o WhatsApp", async () => {
    const r = await como(dono)
      .put("/api/company")
      .send({ name: " Cantina da Nonna ", legalName: "Nonna LTDA", document: "12.345.678/0001-95", whatsapp: "+55 (55) 99999-8888" })
      .expect(200);
    expect(r.body).toEqual({
      code: codigo,
      name: "Cantina da Nonna",
      legalName: "Nonna LTDA",
      document: "12345678000195",
      // DDD 55 (RS) continua: só o 55 do país sai.
      whatsapp: "55999998888",
    });
    const loja = await http().get(`/api/storefront/${codigo}`).expect(200);
    expect(loja.body.company).toMatchObject({ name: "Cantina da Nonna", whatsapp: "55999998888" });

    // Campo vazio apaga.
    const limpo = await como(dono).put("/api/company").send({ name: "Cantina", legalName: "", document: "", whatsapp: " " }).expect(200);
    expect(limpo.body).toMatchObject({ legalName: null, document: null, whatsapp: null });
    // O nome novo aparece no perfil da sessão.
    expect((await como(dono).get("/api/auth/me")).body.company.name).toBe("Cantina");
  });

  it("recusa dados inválidos, quem não pode e não mexe em outro restaurante", async () => {
    await como(dono).put("/api/company").send({ name: "X", document: "123", whatsapp: "999" }).expect(400);
    await como(garcom).get("/api/company").expect(403);
    await como(garcom).put("/api/company").send({ name: "Invadido" }).expect(403);
    await como(donoB).put("/api/company").send({ name: "Bistrô Novo" }).expect(200);
    expect((await como(dono).get("/api/company")).body.name).toBe("Cantina da Nona");
  });
});
