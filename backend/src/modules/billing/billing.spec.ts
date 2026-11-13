import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { billingMonthSchema, billingStatusSchema, type BillingRow } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { invoices, platformAdmins } from "../../db/schema.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarPessoa, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";
import { hojeNoFuso } from "../dashboard/dashboard.service.js";

/** AAAA-MM-DD somando dias (pode ser negativo). */
const somarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe("Cobrança manual", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;
  let admin: string;
  let dono: string;
  let garcom: string;
  let donoB: string;
  let empresaA: string;
  let empresaB: string;
  let empresaSemPlano: string;

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${token}`),
    put: (url: string) => http().put(url).set("Authorization", `Bearer ${token}`),
  });
  const mes = async (m: string) => billingMonthSchema.parse((await como(admin).get(`/api/admin/billing?month=${m}`).expect(200)).body);
  const linha = (rows: BillingRow[], companyId: string) => rows.find((r) => r.company.id === companyId)!;

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
    const adminId = randomUUID();
    await banco.db.execute(sql`insert into auth.users (id) values (${adminId})`);
    await banco.db.insert(platformAdmins).values({ authUserId: adminId, name: "Admin", email: "admin@mesaflow.com" });
    admin = await emitir(adminId);

    const a = await criarRestaurante(banco, { nome: "Cantina" });
    const g = await criarPessoa(banco, a.companyId, { permissions: ["tabs.view"] });
    const b = await criarRestaurante(banco, { nome: "Bistrô" });
    const c = await criarRestaurante(banco, { nome: "Sem plano" });
    empresaA = a.companyId;
    empresaB = b.companyId;
    empresaSemPlano = c.companyId;
    dono = await emitir(a.authUserId);
    garcom = await emitir(g.authUserId);
    donoB = await emitir(b.authUserId);

    await como(admin).put(`/api/admin/companies/${empresaA}/subscription`).send({ plan: "Completo", priceCents: 9990, dueDay: 10 }).expect(200);
    await como(admin).put(`/api/admin/companies/${empresaB}/subscription`).send({ plan: "Essencial", priceCents: 4990, dueDay: 28 }).expect(200);
  });

  it("gera as faturas do mês só para quem tem plano, e repetir não duplica", async () => {
    expect((await como(admin).post("/api/admin/billing/generate").send({ month: "2026-10" }).expect(200)).body).toEqual({ created: 2 });
    expect((await como(admin).post("/api/admin/billing/generate").send({ month: "2026-10" }).expect(200)).body).toEqual({ created: 0 });
    expect((await como(admin).post("/api/admin/billing/generate").send({ month: "2026-11" }).expect(200)).body).toEqual({ created: 2 });

    const out = await mes("2026-10");
    expect(linha(out.rows, empresaA).invoice).toMatchObject({ reference: "2026-10-01", plan: "Completo", amountCents: 9990, dueDate: "2026-10-10", status: "pending" });
    expect(linha(out.rows, empresaB).invoice).toMatchObject({ dueDate: "2026-10-28", amountCents: 4990 });
    expect(linha(out.rows, empresaSemPlano)).toMatchObject({ subscription: null, invoice: null });

    // Mudar o plano depois não mexe na fatura já gerada.
    await como(admin).put(`/api/admin/companies/${empresaA}/subscription`).send({ plan: "Completo", priceCents: 12000, dueDay: 5 }).expect(200);
    expect(linha((await mes("2026-10")).rows, empresaA).invoice!.amountCents).toBe(9990);

    await como(admin).post("/api/admin/billing/generate").send({ month: "2026-13" }).expect(400);
    await como(admin).put(`/api/admin/companies/${empresaA}/subscription`).send({ plan: "X1", priceCents: 100, dueDay: 31 }).expect(400);
    await como(admin).put(`/api/admin/companies/${randomUUID()}/subscription`).send({ plan: "Completo", priceCents: 100, dueDay: 1 }).expect(404);
  });

  it("atrasada é pendente com vencimento antes de hoje em São Paulo; vencendo hoje ainda não", async () => {
    const hoje = hojeNoFuso();
    const m = hoje.slice(0, 7);
    await como(admin).post("/api/admin/billing/generate").send({ month: m }).expect(200);
    await banco.db.update(invoices).set({ dueDate: hoje }).where(eq(invoices.companyId, empresaA));
    await banco.db.update(invoices).set({ dueDate: somarDias(hoje, -3) }).where(eq(invoices.companyId, empresaB));

    const out = await mes(m);
    expect(linha(out.rows, empresaA).invoice!.daysLate).toBe(0);
    expect(linha(out.rows, empresaA).overdue).toEqual({ count: 0, totalCents: 0, maxDaysLate: 0 });
    expect(linha(out.rows, empresaB).invoice!.daysLate).toBe(3);
    expect(linha(out.rows, empresaB).overdue).toEqual({ count: 1, totalCents: 4990, maxDaysLate: 3 });
    expect(out.totals).toEqual({ paidCents: 0, pendingCents: 9990 + 4990, overdueCents: 4990 });

    // O restaurante vê só o próprio atraso; quem não cuida dos dados do restaurante não vê.
    expect(billingStatusSchema.parse((await como(dono).get("/api/billing/status").expect(200)).body)).toEqual({ overdue: [] });
    expect((await como(donoB).get("/api/billing/status").expect(200)).body.overdue).toEqual([
      { reference: `${m}-01`, amountCents: 4990, dueDate: somarDias(hoje, -3), daysLate: 3 },
    ]);
    await como(garcom).get("/api/billing/status").expect(403);
  });

  it("marca paga, desfaz e cancela, guardando quem fez", async () => {
    await como(admin).post("/api/admin/billing/generate").send({ month: "2026-10" }).expect(200);
    const f = linha((await mes("2026-10")).rows, empresaA).invoice!;

    const paga = await como(admin).post(`/api/admin/invoices/${f.id}/pay`).send({ method: "pix", note: "comprovante no WhatsApp" }).expect(200);
    expect(paga.body).toMatchObject({ status: "paid", paymentMethod: "pix", note: "comprovante no WhatsApp", daysLate: 0 });
    expect(paga.body.paidAt).toBeTruthy();
    const [gravada] = await banco.db.select().from(invoices).where(eq(invoices.id, f.id));
    expect(gravada!.changedBy).not.toBeNull();
    await como(admin).post(`/api/admin/invoices/${f.id}/pay`).send({ method: "pix" }).expect(409);
    await como(admin).post(`/api/admin/invoices/${f.id}/cancel`).expect(409); // paga não cancela direto

    const desfeita = await como(admin).post(`/api/admin/invoices/${f.id}/reopen`).expect(200);
    expect(desfeita.body).toMatchObject({ status: "pending", paidAt: null, paymentMethod: null });
    await como(admin).post(`/api/admin/invoices/${f.id}/reopen`).expect(409);

    const cancelada = await como(admin).post(`/api/admin/invoices/${f.id}/cancel`).expect(200);
    expect(cancelada.body.status).toBe("canceled");
    expect((await mes("2026-10")).totals).toMatchObject({ paidCents: 0, pendingCents: 4990 });

    await como(admin).post(`/api/admin/invoices/${f.id}/pay`).send({ method: "cheque" }).expect(400);
    await como(admin).post(`/api/admin/invoices/${randomUUID()}/pay`).send({ method: "pix" }).expect(404);
  });

  it("só a equipe MesaFlow mexe na cobrança", async () => {
    await como(dono).get("/api/admin/billing").expect(403);
    await como(dono).post("/api/admin/billing/generate").send({ month: "2026-10" }).expect(403);
    await como(dono).put(`/api/admin/companies/${empresaA}/subscription`).send({ plan: "Grátis", priceCents: 1, dueDay: 1 }).expect(403);
    await http().get("/api/admin/billing").expect(401);
    await http().get("/api/billing/status").expect(401);
  });
});
