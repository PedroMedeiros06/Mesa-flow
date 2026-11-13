import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, isNull, min, ne, sql } from "drizzle-orm";
import {
  DEFAULT_SERVICE_FEE_BPS,
  formatMoney,
  PAYMENT_LABELS,
  tabTotals,
  type TabDetail,
  type tabOpenSchema,
  type tabPaymentInputSchema,
  type tabRoundInputSchema,
  type TabSummary,
} from "@mesaflow/shared";
import type { z } from "zod";
import { DB, type Database, type Transaction } from "../../db/database.module.js";
import { companies, members, orderItems, orders, tabEvents, tabPayments, tabs, waiterCalls } from "../../db/schema.js";
import { OrdersService } from "../orders/orders.service.js";
import { StockService } from "../stock/stock.service.js";

type AbrirData = z.output<typeof tabOpenSchema>;
type RodadaData = z.output<typeof tabRoundInputSchema>;
type PagamentoData = z.output<typeof tabPaymentInputSchema>;
type Conn = Database | Transaction;
type Comanda = typeof tabs.$inferSelect;
type Somas = { itens: number; pago: number; rodadas: number; chamando: Date | string | null };

const HOJE = sql`(now() at time zone 'America/Sao_Paulo')::date`;

const naoEncontrada = () => new NotFoundException({ statusCode: 404, message: "Comanda não encontrada." });
const conflito = (message: string) => new ConflictException({ statusCode: 409, message });

function restricao(erro: unknown): string | undefined {
  const e = erro as { constraint_name?: string; constraint?: string; cause?: { constraint_name?: string; constraint?: string } };
  return e.constraint_name ?? e.constraint ?? e.cause?.constraint_name ?? e.cause?.constraint;
}

/**
 * Comandas de mesa. Toda escrita trava a linha da comanda (SELECT ... FOR UPDATE) na mesma transação:
 * dois garçons lançando, pagando ou fechando a mesma mesa ao mesmo tempo esperam um pelo outro,
 * e quem chega depois vê a comanda como ela ficou.
 */
@Injectable()
export class TabsService {
  constructor(
    @Inject(DB) private readonly db: Database | null,
    private readonly orders: OrdersService,
    private readonly stock: StockService,
  ) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  // ---------- leitura ----------

  /** Abertas (mapa de mesas) ou fechadas hoje (para conferir e reabrir). */
  async list(companyId: string, scope: "abertas" | "hoje"): Promise<TabSummary[]> {
    const filtro =
      scope === "abertas"
        ? eq(tabs.status, "aberta")
        : and(eq(tabs.status, "fechada"), sql`(${tabs.closedAt} at time zone 'America/Sao_Paulo')::date = ${HOJE}`);
    const rows = await this.conn
      .select({ t: tabs, openedByName: members.name })
      .from(tabs)
      .leftJoin(members, eq(members.id, tabs.openedBy))
      .where(and(eq(tabs.companyId, companyId), filtro))
      .orderBy(
        ...(scope === "abertas"
          ? [sql`${tabs.tableNumber} asc nulls last`, asc(tabs.openedAt)]
          : [desc(tabs.closedAt)]),
      );
    const somas = await this.somas(this.conn, companyId, rows.map((r) => r.t.id));
    return rows.map(({ t, openedByName }) => this.resumo(t, openedByName, somas.get(t.id)));
  }

  async detail(companyId: string, id: string): Promise<TabDetail> {
    const [row] = await this.conn
      .select({ t: tabs, openedByName: members.name })
      .from(tabs)
      .leftJoin(members, eq(members.id, tabs.openedBy))
      .where(and(eq(tabs.companyId, companyId), eq(tabs.id, id)));
    if (!row) throw naoEncontrada();
    const [somas, rodadas, pagamentos, eventos] = await Promise.all([
      this.somas(this.conn, companyId, [id]),
      this.orders.ofTab(companyId, id),
      this.conn
        .select({ p: tabPayments, createdByName: members.name })
        .from(tabPayments)
        .leftJoin(members, eq(members.id, tabPayments.createdBy))
        .where(and(eq(tabPayments.companyId, companyId), eq(tabPayments.tabId, id)))
        .orderBy(asc(tabPayments.createdAt)),
      this.conn
        .select({ e: tabEvents, memberName: members.name })
        .from(tabEvents)
        .leftJoin(members, eq(members.id, tabEvents.memberId))
        .where(and(eq(tabEvents.companyId, companyId), eq(tabEvents.tabId, id)))
        .orderBy(desc(tabEvents.createdAt), desc(tabEvents.id))
        .limit(200),
    ]);
    return {
      ...this.resumo(row.t, row.openedByName, somas.get(id)),
      mergedIntoId: row.t.mergedIntoId,
      orders: rodadas,
      payments: pagamentos.map(({ p, createdByName }) => ({
        id: p.id,
        method: p.method,
        amountCents: p.amountCents,
        receivedCents: p.receivedCents,
        changeCents: p.changeCents,
        payerLabel: p.payerLabel,
        voided: p.voidedAt !== null,
        voidReason: p.voidReason,
        createdByName,
        createdAt: p.createdAt.toISOString(),
      })),
      events: eventos.map(({ e, memberName }) => ({
        kind: e.kind,
        description: e.description,
        memberName,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  /** Subtotal (itens não cancelados de rodadas não canceladas), pago e número de rodadas por comanda. */
  private async somas(conn: Conn, companyId: string, ids: string[]) {
    const mapa = new Map<string, Somas>();
    if (!ids.length) return mapa;
    const [itens, pagos, rodadas, chamados] = await Promise.all([
      conn
        .select({ tabId: orders.tabId, total: sql<number>`coalesce(sum(${orderItems.totalCents}), 0)::int` })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(
          and(
            eq(orders.companyId, companyId),
            inArray(orders.tabId, ids),
            ne(orders.status, "cancelado"),
            isNull(orderItems.cancelledAt),
          ),
        )
        .groupBy(orders.tabId),
      conn
        .select({ tabId: tabPayments.tabId, total: sql<number>`coalesce(sum(${tabPayments.amountCents}), 0)::int` })
        .from(tabPayments)
        .where(and(eq(tabPayments.companyId, companyId), inArray(tabPayments.tabId, ids), isNull(tabPayments.voidedAt)))
        .groupBy(tabPayments.tabId),
      conn
        .select({ tabId: orders.tabId, n: count() })
        .from(orders)
        .where(and(eq(orders.companyId, companyId), inArray(orders.tabId, ids), ne(orders.status, "cancelado")))
        .groupBy(orders.tabId),
      conn
        .select({ tabId: waiterCalls.tabId, desde: min(waiterCalls.createdAt) })
        .from(waiterCalls)
        .where(and(eq(waiterCalls.companyId, companyId), inArray(waiterCalls.tabId, ids), isNull(waiterCalls.answeredAt)))
        .groupBy(waiterCalls.tabId),
    ]);
    for (const id of ids) {
      mapa.set(id, {
        itens: itens.find((i) => i.tabId === id)?.total ?? 0,
        pago: pagos.find((p) => p.tabId === id)?.total ?? 0,
        rodadas: rodadas.find((r) => r.tabId === id)?.n ?? 0,
        chamando: chamados.find((c) => c.tabId === id)?.desde ?? null,
      });
    }
    return mapa;
  }

  private resumo(t: Comanda, openedByName: string | null, s: Somas = { itens: 0, pago: 0, rodadas: 0, chamando: null }): TabSummary {
    // Fechada: vale o que foi congelado no fechamento.
    const totals =
      t.status === "fechada" && t.closedTotalCents !== null
        ? {
            subtotalCents: t.closedSubtotalCents ?? 0,
            serviceFeeCents: t.closedServiceFeeCents ?? 0,
            totalCents: t.closedTotalCents,
            paidCents: s.pago,
            remainingCents: Math.max(t.closedTotalCents - s.pago, 0),
          }
        : tabTotals([s.itens], t.serviceFeeBps, s.pago);
    return {
      id: t.id,
      label: t.label,
      tableNumber: t.tableNumber,
      status: t.status,
      serviceFeeBps: t.serviceFeeBps,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt?.toISOString() ?? null,
      openedByName,
      rounds: s.rodadas,
      totals,
      callingSince: t.status === "aberta" && s.chamando ? new Date(s.chamando).toISOString() : null,
    };
  }

  // ---------- trava e histórico ----------

  private async travar(tx: Transaction, companyId: string, id: string): Promise<Comanda> {
    const [t] = await tx
      .select()
      .from(tabs)
      .where(and(eq(tabs.companyId, companyId), eq(tabs.id, id)))
      .for("update");
    if (!t) throw naoEncontrada();
    return t;
  }

  private exigirAberta(t: Comanda) {
    if (t.status === "fechada") throw conflito(`A comanda ${t.label} já foi fechada. Reabra para mexer nela.`);
    if (t.status === "juntada") throw conflito(`A comanda ${t.label} foi juntada a outra mesa.`);
  }

  private evento(tx: Transaction, companyId: string, tabId: string, memberId: string | null, kind: string, description: string) {
    return tx.insert(tabEvents).values({ companyId, tabId, memberId, kind, description });
  }

  private async totaisNaTransacao(tx: Transaction, companyId: string, t: Comanda) {
    const s = (await this.somas(tx, companyId, [t.id])).get(t.id)!;
    return tabTotals([s.itens], t.serviceFeeBps, s.pago);
  }

  // ---------- abrir e lançar ----------

  /** Taxa com que a mesa abre: a do restaurante (Ajustes). A mesa guarda uma cópia, então mudar depois não mexe nas abertas. */
  private async taxaPadrao(tx: Transaction, companyId: string): Promise<number> {
    const [c] = await tx.select({ bps: companies.serviceFeeBps }).from(companies).where(eq(companies.id, companyId));
    return c?.bps ?? DEFAULT_SERVICE_FEE_BPS;
  }

  async open(companyId: string, memberId: string, data: AbrirData): Promise<TabDetail> {
    const label = data.label || `Mesa ${data.tableNumber}`;
    try {
      const id = await this.conn.transaction(async (tx) => {
        const [t] = await tx
          .insert(tabs)
          .values({
            companyId,
            label,
            tableNumber: data.tableNumber,
            serviceFeeBps: await this.taxaPadrao(tx, companyId),
            openedBy: memberId,
          })
          .returning({ id: tabs.id });
        await this.evento(tx, companyId, t!.id, memberId, "aberta", `Comanda aberta: ${label}`);
        return t!.id;
      });
      return this.detail(companyId, id);
    } catch (erro) {
      if (restricao(erro) === "tabs_open_table") throw conflito(`A mesa ${data.tableNumber} já tem uma comanda aberta.`);
      throw erro;
    }
  }

  /** Rodada: vira um pedido (vai para a cozinha) ligado à comanda, com estoque na mesma transação. */
  async addRound(companyId: string, memberId: string, tabId: string, data: RodadaData): Promise<TabDetail> {
    const itens = data.items.reduce((s, i) => s + i.quantity, 0);
    await this.orders.registrar(
      companyId,
      memberId,
      {
        clientRequestId: data.clientRequestId,
        customerName: "",
        customerPhone: "",
        notes: data.notes,
        paymentMethod: null,
        receivedCents: null,
        discount: null,
        items: data.items,
        origin: "mesa",
        tabId,
      },
      async (tx) => {
        this.exigirAberta(await this.travar(tx, companyId, tabId));
        await this.evento(tx, companyId, tabId, memberId, "rodada", `Rodada lançada com ${itens} ${itens === 1 ? "item" : "itens"}`);
      },
    );
    return this.detail(companyId, tabId);
  }

  /**
   * Lança na conta da mesa pelo número (usado pelo Balcão). Se a mesa não tem comanda aberta,
   * abre na mesma transação do pedido: se faltar estoque, nem a comanda nem o pedido ficam gravados.
   */
  async roundForTable(companyId: string, memberId: string, tableNumber: number, data: RodadaData): Promise<TabDetail> {
    const aberta = async () =>
      (
        await this.conn
          .select({ id: tabs.id })
          .from(tabs)
          .where(and(eq(tabs.companyId, companyId), eq(tabs.tableNumber, tableNumber), eq(tabs.status, "aberta")))
      )[0];
    const existente = await aberta();
    if (existente) return this.addRound(companyId, memberId, existente.id, data);

    const tabId = randomUUID();
    const label = `Mesa ${tableNumber}`;
    const itens = data.items.reduce((s, i) => s + i.quantity, 0);
    try {
      const { order } = await this.orders.registrar(
        companyId,
        memberId,
        {
          clientRequestId: data.clientRequestId,
          customerName: "",
          customerPhone: "",
          notes: data.notes,
          paymentMethod: null,
          receivedCents: null,
          discount: null,
          items: data.items,
          origin: "mesa",
          tabId,
        },
        async (tx) => {
          await tx.insert(tabs).values({
            id: tabId,
            companyId,
            label,
            tableNumber,
            serviceFeeBps: await this.taxaPadrao(tx, companyId),
            openedBy: memberId,
          });
          await this.evento(tx, companyId, tabId, memberId, "aberta", `Comanda aberta pelo balcão: ${label}`);
          await this.evento(tx, companyId, tabId, memberId, "rodada", `Rodada lançada com ${itens} ${itens === 1 ? "item" : "itens"}`);
        },
      );
      // Pedido repetido (mesmo clientRequestId) devolve a comanda onde ele já está.
      return this.detail(companyId, order.tabId ?? tabId);
    } catch (erro) {
      // Outra pessoa abriu a mesa no mesmo instante: lança na comanda dela.
      if (restricao(erro) === "tabs_open_table") {
        const agora = await aberta();
        if (agora) return this.addRound(companyId, memberId, agora.id, data);
      }
      throw erro;
    }
  }

  // ---------- cancelar item e transferir ----------

  /**
   * Tira um item da conta. Se a rodada ainda estava como "novo" (a cozinha não começou),
   * o estoque volta; depois disso, o que foi preparado já saiu da prateleira.
   */
  async cancelItem(companyId: string, memberId: string, tabId: string, itemId: string, reason: string): Promise<TabDetail> {
    await this.conn.transaction(async (tx) => {
      this.exigirAberta(await this.travar(tx, companyId, tabId));
      const [item] = await tx
        .select({ i: orderItems, status: orders.status, orderNumber: orders.number })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orderItems.companyId, companyId), eq(orderItems.id, itemId), eq(orders.tabId, tabId)));
      if (!item) throw new NotFoundException({ statusCode: 404, message: "Item não encontrado nesta comanda." });
      if (item.status === "cancelado") throw conflito("Esta rodada já foi cancelada.");
      const [cancelado] = await tx
        .update(orderItems)
        .set({ cancelledAt: new Date(), cancelledBy: memberId, cancelReason: reason })
        .where(and(eq(orderItems.id, itemId), isNull(orderItems.cancelledAt)))
        .returning({ id: orderItems.id });
      if (!cancelado) throw conflito(`${item.i.name} já tinha sido cancelado.`);

      const devolve = item.status === "novo";
      if (devolve) {
        await this.stock.estornar(tx, companyId, memberId, item.i.consumption, `Item cancelado no pedido ${item.orderNumber}`);
      }
      // O pedido passa a valer só o que sobrou; sem nada, ele mesmo vira cancelado.
      const [resto] = await tx
        .select({ total: sql<number>`coalesce(sum(${orderItems.totalCents}), 0)::int`, n: count() })
        .from(orderItems)
        .where(and(eq(orderItems.orderId, item.i.orderId), isNull(orderItems.cancelledAt)));
      await tx
        .update(orders)
        .set({
          subtotalCents: resto!.total,
          discountCents: 0,
          totalCents: resto!.total,
          ...(resto!.n === 0
            ? { status: "cancelado" as const, statusChangedAt: new Date(), cancelledBy: memberId, cancelReason: "Todos os itens cancelados" }
            : {}),
        })
        .where(eq(orders.id, item.i.orderId));
      await this.evento(
        tx,
        companyId,
        tabId,
        memberId,
        "item_cancelado",
        `${item.i.quantity}× ${item.i.name} cancelado (${reason})${devolve ? "; estoque devolvido" : "; já estava em preparo, estoque não volta"}`,
      );
    });
    return this.detail(companyId, tabId);
  }

  /** Trava duas comandas sempre na mesma ordem (por id), para dois garçons não se travarem um ao outro. */
  private async travarDuas(tx: Transaction, companyId: string, a: string, b: string) {
    if (a === b) throw new BadRequestException({ statusCode: 400, message: "Escolha outra comanda." });
    const [primeiro, segundo] = [a, b].sort();
    const t1 = await this.travar(tx, companyId, primeiro!);
    const t2 = await this.travar(tx, companyId, segundo!);
    const porId = new Map([t1, t2].map((t) => [t.id, t]));
    const origem = porId.get(a)!;
    const destino = porId.get(b)!;
    this.exigirAberta(origem);
    this.exigirAberta(destino);
    return { origem, destino };
  }

  async transferRound(companyId: string, memberId: string, tabId: string, orderId: string, toTabId: string): Promise<TabDetail> {
    await this.conn.transaction(async (tx) => {
      const { origem, destino } = await this.travarDuas(tx, companyId, tabId, toTabId);
      const [movido] = await tx
        .update(orders)
        .set({ tabId: destino.id })
        .where(and(eq(orders.companyId, companyId), eq(orders.id, orderId), eq(orders.tabId, origem.id), ne(orders.status, "cancelado")))
        .returning({ number: orders.number });
      if (!movido) throw new NotFoundException({ statusCode: 404, message: "Rodada não encontrada nesta comanda." });
      await this.evento(tx, companyId, origem.id, memberId, "transferida", `Pedido ${movido.number} transferido para ${destino.label}`);
      await this.evento(tx, companyId, destino.id, memberId, "recebida", `Pedido ${movido.number} veio de ${origem.label}`);
    });
    return this.detail(companyId, tabId);
  }

  /** Junta esta comanda em outra: rodadas e pagamentos vão juntos; esta fica como "juntada". */
  async merge(companyId: string, memberId: string, tabId: string, intoTabId: string): Promise<TabDetail> {
    await this.conn.transaction(async (tx) => {
      const { origem, destino } = await this.travarDuas(tx, companyId, tabId, intoTabId);
      await tx.update(orders).set({ tabId: destino.id }).where(and(eq(orders.companyId, companyId), eq(orders.tabId, origem.id)));
      await tx
        .update(tabPayments)
        .set({ tabId: destino.id })
        .where(and(eq(tabPayments.companyId, companyId), eq(tabPayments.tabId, origem.id)));
      await tx
        .update(tabs)
        .set({ status: "juntada", mergedIntoId: destino.id, closedAt: new Date(), closedBy: memberId })
        .where(eq(tabs.id, origem.id));
      await this.evento(tx, companyId, origem.id, memberId, "juntada", `Juntada a ${destino.label}`);
      await this.evento(tx, companyId, destino.id, memberId, "juntou", `${origem.label} foi juntada a esta comanda`);
    });
    return this.detail(companyId, intoTabId);
  }

  // ---------- conta ----------

  async setServiceFee(companyId: string, memberId: string, tabId: string, bps: number): Promise<TabDetail> {
    await this.conn.transaction(async (tx) => {
      const t = await this.travar(tx, companyId, tabId);
      this.exigirAberta(t);
      await tx.update(tabs).set({ serviceFeeBps: bps }).where(eq(tabs.id, tabId));
      const pct = (bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
      await this.evento(tx, companyId, tabId, memberId, "taxa", bps === 0 ? "Taxa de serviço retirada" : `Taxa de serviço em ${pct}%`);
    });
    return this.detail(companyId, tabId);
  }

  async pay(companyId: string, memberId: string, tabId: string, data: PagamentoData): Promise<TabDetail> {
    const ja = await this.conn
      .select({ id: tabPayments.id })
      .from(tabPayments)
      .where(and(eq(tabPayments.companyId, companyId), eq(tabPayments.clientRequestId, data.clientRequestId)));
    if (ja.length) return this.detail(companyId, tabId);

    try {
      await this.conn.transaction(async (tx) => {
        const t = await this.travar(tx, companyId, tabId);
        this.exigirAberta(t);
        const { remainingCents } = await this.totaisNaTransacao(tx, companyId, t);
        if (data.amountCents > remainingCents) {
          throw new BadRequestException({
            statusCode: 400,
            message: "Dados inválidos",
            issues: [{ path: "amountCents", message: `O valor passa do que falta pagar (${formatMoney(remainingCents)}).` }],
          });
        }
        let receivedCents: number | null = null;
        let changeCents = 0;
        if (data.method === "dinheiro" && data.receivedCents !== null) {
          if (data.receivedCents < data.amountCents) {
            throw new BadRequestException({
              statusCode: 400,
              message: "Dados inválidos",
              issues: [{ path: "receivedCents", message: "O valor recebido é menor que o pagamento." }],
            });
          }
          receivedCents = data.receivedCents;
          changeCents = data.receivedCents - data.amountCents;
        }
        await tx.insert(tabPayments).values({
          companyId,
          tabId,
          method: data.method,
          amountCents: data.amountCents,
          receivedCents,
          changeCents,
          payerLabel: data.payerLabel,
          clientRequestId: data.clientRequestId,
          createdBy: memberId,
        });
        const quem = data.payerLabel ? ` (${data.payerLabel})` : "";
        await this.evento(
          tx,
          companyId,
          tabId,
          memberId,
          "pagamento",
          `Pagamento de ${formatMoney(data.amountCents)} em ${PAYMENT_LABELS[data.method].toLowerCase()}${quem}`,
        );
      });
    } catch (erro) {
      if (restricao(erro) !== "tab_payments_company_request") throw erro;
    }
    return this.detail(companyId, tabId);
  }

  async voidPayment(companyId: string, memberId: string, tabId: string, paymentId: string, reason: string): Promise<TabDetail> {
    await this.conn.transaction(async (tx) => {
      this.exigirAberta(await this.travar(tx, companyId, tabId));
      const [estornado] = await tx
        .update(tabPayments)
        .set({ voidedAt: new Date(), voidedBy: memberId, voidReason: reason })
        .where(
          and(
            eq(tabPayments.companyId, companyId),
            eq(tabPayments.tabId, tabId),
            eq(tabPayments.id, paymentId),
            isNull(tabPayments.voidedAt),
          ),
        )
        .returning({ amountCents: tabPayments.amountCents });
      if (!estornado) throw conflito("Pagamento não encontrado ou já estornado.");
      await this.evento(tx, companyId, tabId, memberId, "estorno", `Pagamento de ${formatMoney(estornado.amountCents)} estornado (${reason})`);
    });
    return this.detail(companyId, tabId);
  }

  /** Fecha só com a conta paga. Os valores ficam congelados. */
  async close(companyId: string, memberId: string, tabId: string): Promise<TabDetail> {
    await this.conn.transaction(async (tx) => {
      const t = await this.travar(tx, companyId, tabId);
      this.exigirAberta(t);
      const tot = await this.totaisNaTransacao(tx, companyId, t);
      if (tot.remainingCents > 0) throw conflito(`Falta receber ${formatMoney(tot.remainingCents)} para fechar.`);
      await tx
        .update(tabs)
        .set({
          status: "fechada",
          closedAt: new Date(),
          closedBy: memberId,
          closedSubtotalCents: tot.subtotalCents,
          closedServiceFeeCents: tot.serviceFeeCents,
          closedTotalCents: tot.totalCents,
        })
        .where(eq(tabs.id, tabId));
      await this.evento(tx, companyId, tabId, memberId, "fechada", `Comanda fechada em ${formatMoney(tot.totalCents)}`);
      // Chamado que ficou aberto não volta se a comanda for reaberta depois.
      await tx
        .update(waiterCalls)
        .set({ answeredAt: new Date(), answeredBy: memberId })
        .where(and(eq(waiterCalls.companyId, companyId), eq(waiterCalls.tabId, tabId), isNull(waiterCalls.answeredAt)));
    });
    return this.detail(companyId, tabId);
  }

  async reopen(companyId: string, memberId: string, tabId: string, reason: string): Promise<TabDetail> {
    try {
      await this.conn.transaction(async (tx) => {
        const t = await this.travar(tx, companyId, tabId);
        if (t.status !== "fechada") throw conflito("Só dá para reabrir uma comanda fechada.");
        await tx
          .update(tabs)
          .set({
            status: "aberta",
            closedAt: null,
            closedBy: null,
            closedSubtotalCents: null,
            closedServiceFeeCents: null,
            closedTotalCents: null,
          })
          .where(eq(tabs.id, tabId));
        await this.evento(tx, companyId, tabId, memberId, "reaberta", `Comanda reaberta (${reason})`);
      });
    } catch (erro) {
      if (restricao(erro) === "tabs_open_table") throw conflito("Esta mesa já tem outra comanda aberta. Feche ou junte antes de reabrir.");
      throw erro;
    }
    return this.detail(companyId, tabId);
  }

  // ---------- chamado do garçom ----------

  /** Alguém da equipe foi até a mesa: encerra os chamados abertos dela. */
  async answerCall(companyId: string, memberId: string, tabId: string): Promise<TabDetail> {
    await this.conn.transaction(async (tx) => {
      await this.travar(tx, companyId, tabId);
      const atendidos = await tx
        .update(waiterCalls)
        .set({ answeredAt: new Date(), answeredBy: memberId })
        .where(and(eq(waiterCalls.companyId, companyId), eq(waiterCalls.tabId, tabId), isNull(waiterCalls.answeredAt)))
        .returning({ id: waiterCalls.id });
      if (atendidos.length) await this.evento(tx, companyId, tabId, memberId, "chamado_atendido", "Chamado do cliente atendido");
    });
    return this.detail(companyId, tabId);
  }
}
