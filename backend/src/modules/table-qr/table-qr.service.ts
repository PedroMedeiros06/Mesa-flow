import { randomBytes } from "node:crypto";
import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, asc, between, desc, eq, isNull, min } from "drizzle-orm";
import { WAITER_CALL_COOLDOWN_MS, type PublicTab, type TableCode, type WaiterCall } from "@mesaflow/shared";
import { DB, type Database } from "../../db/database.module.js";
import { companies, tableCodes, tabEvents, tabs, waiterCalls } from "../../db/schema.js";
import { TabsService } from "../tabs/tabs.service.js";
import { PlanLimitsService } from "../plan-limits/plan-limits.service.js";

/** 16 bytes aleatórios (128 bits): não dá para adivinhar o QR de outra mesa trocando um número. */
const novoToken = () => randomBytes(16).toString("base64url");

const qrInvalido = () =>
  new NotFoundException({ statusCode: 404, message: "Este QR code não vale mais. Peça ajuda ao garçom." });

const semConta = () =>
  new ConflictException({ statusCode: 409, message: "Esta mesa não tem conta aberta. Chame o garçom com um aceno." });

/**
 * QR fixo de cada mesa: o cliente vê a conta aberta da mesa e chama o garçom, sem login.
 * O QR aponta para o número da mesa; quando a comanda fecha, o próximo cliente não vê a conta anterior.
 */
@Injectable()
export class TableQrService {
  constructor(
    @Inject(DB) private readonly db: Database | null,
    private readonly tabs: TabsService,
    private readonly limites: PlanLimitsService,
  ) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  // ---------- equipe ----------

  /** QR das mesas do intervalo; as que ainda não têm ganham um agora. */
  async codes(companyId: string, from: number, to: number): Promise<TableCode[]> {
    await this.limites.exigirMesa(companyId, to);
    const numeros = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    await this.conn
      .insert(tableCodes)
      .values(numeros.map((tableNumber) => ({ companyId, tableNumber, token: novoToken() })))
      .onConflictDoNothing();
    return this.conn
      .select({ tableNumber: tableCodes.tableNumber, token: tableCodes.token })
      .from(tableCodes)
      .where(and(eq(tableCodes.companyId, companyId), between(tableCodes.tableNumber, from, to)))
      .orderBy(asc(tableCodes.tableNumber));
  }

  /** Troca o QR de uma mesa: o adesivo antigo para de funcionar. */
  async regenerate(companyId: string, tableNumber: number): Promise<TableCode> {
    await this.limites.exigirMesa(companyId, tableNumber);
    const [c] = await this.conn
      .insert(tableCodes)
      .values({ companyId, tableNumber, token: novoToken() })
      .onConflictDoUpdate({
        target: [tableCodes.companyId, tableCodes.tableNumber],
        set: { token: novoToken(), createdAt: new Date() },
      })
      .returning({ tableNumber: tableCodes.tableNumber, token: tableCodes.token });
    return c!;
  }

  /** Mesas chamando agora (só comandas abertas), da que chamou primeiro para a última. */
  async pendingCalls(companyId: string): Promise<WaiterCall[]> {
    const desde = min(waiterCalls.createdAt);
    const rows = await this.conn
      .select({ tabId: waiterCalls.tabId, label: tabs.label, tableNumber: tabs.tableNumber, desde })
      .from(waiterCalls)
      .innerJoin(tabs, eq(tabs.id, waiterCalls.tabId))
      .where(and(eq(waiterCalls.companyId, companyId), isNull(waiterCalls.answeredAt), eq(tabs.status, "aberta")))
      .groupBy(waiterCalls.tabId, tabs.label, tabs.tableNumber)
      .orderBy(asc(desde));
    return rows.map((r) => ({
      tabId: r.tabId,
      label: r.label,
      tableNumber: r.tableNumber,
      createdAt: new Date(r.desde!).toISOString(),
    }));
  }

  // ---------- cliente ----------

  /** Mesa do QR, de restaurante ativo. Token trocado, inexistente ou restaurante bloqueado dão a mesma resposta. */
  private async mesa(token: string) {
    const [m] = await this.conn
      .select({ companyId: tableCodes.companyId, tableNumber: tableCodes.tableNumber, companyName: companies.name })
      .from(tableCodes)
      .innerJoin(companies, eq(companies.id, tableCodes.companyId))
      .where(and(eq(tableCodes.token, token), eq(companies.status, "active")));
    // Plano sem mesas: o QR para de funcionar como se não existisse.
    if (!m || !(await this.limites.moduloLigado(m.companyId, "tabs"))) throw qrInvalido();
    return m;
  }

  private async comandaAberta(companyId: string, tableNumber: number) {
    const [t] = await this.conn
      .select({ id: tabs.id })
      .from(tabs)
      .where(and(eq(tabs.companyId, companyId), eq(tabs.tableNumber, tableNumber), eq(tabs.status, "aberta")));
    return t?.id ?? null;
  }

  async view(token: string): Promise<PublicTab> {
    const m = await this.mesa(token);
    const base = { company: { name: m.companyName }, tableNumber: m.tableNumber };
    const id = await this.comandaAberta(m.companyId, m.tableNumber);
    if (!id) return { ...base, tab: null };
    const d = await this.tabs.detail(m.companyId, id);
    return {
      ...base,
      tab: {
        label: d.label,
        openedAt: d.openedAt,
        // Só o primeiro nome de quem atendeu.
        openedByName: d.openedByName?.trim().split(/\s+/)[0] ?? null,
        rounds: d.orders
          .filter((o) => o.status !== "cancelado")
          .map((o) => ({
            id: o.id,
            number: o.number,
            status: o.status,
            createdAt: o.createdAt,
            items: o.items
              .filter((i) => !i.cancelled)
              .map((i) => ({
                name: i.name,
                quantity: i.quantity,
                addons: i.addons.map((a) => a.name),
                removed: i.removed,
                totalCents: i.totalCents,
              })),
          }))
          .filter((r) => r.items.length > 0)
          .reverse(),
        totals: d.totals,
        calledAt: d.callingSince,
      },
    };
  }

  /**
   * Cliente chama o garçom. Enquanto o chamado não for atendido, ou no primeiro minuto depois dele,
   * apertar de novo devolve o mesmo chamado em vez de criar outro.
   */
  async call(token: string): Promise<{ calledAt: string; created: boolean }> {
    const m = await this.mesa(token);
    const id = await this.comandaAberta(m.companyId, m.tableNumber);
    if (!id) throw semConta();
    return this.conn.transaction(async (tx) => {
      // Trava a comanda: dois toques ao mesmo tempo não viram dois chamados.
      const [t] = await tx.select({ status: tabs.status }).from(tabs).where(eq(tabs.id, id)).for("update");
      if (t?.status !== "aberta") throw semConta();
      const [ultimo] = await tx
        .select()
        .from(waiterCalls)
        .where(and(eq(waiterCalls.companyId, m.companyId), eq(waiterCalls.tabId, id)))
        .orderBy(desc(waiterCalls.createdAt))
        .limit(1);
      if (ultimo && (!ultimo.answeredAt || Date.now() - ultimo.createdAt.getTime() < WAITER_CALL_COOLDOWN_MS)) {
        return { calledAt: ultimo.createdAt.toISOString(), created: false };
      }
      const [novo] = await tx.insert(waiterCalls).values({ companyId: m.companyId, tabId: id }).returning();
      await tx.insert(tabEvents).values({
        companyId: m.companyId,
        tabId: id,
        memberId: null,
        kind: "chamado",
        description: "Cliente chamou o garçom pelo QR",
      });
      return { calledAt: novo!.createdAt.toISOString(), created: true };
    });
  }
}
