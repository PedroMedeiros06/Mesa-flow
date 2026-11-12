import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { and, count, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { DashboardSummary } from "@mesaflow/shared";
import { DB, type Database } from "../../db/database.module.js";
import { orderItems, orders, tabs } from "../../db/schema.js";

const FUSO = "America/Sao_Paulo";
const soma = (coluna: SQL | unknown) => sql<number>`coalesce(sum(${coluna}), 0)::int`;
/** Dia (no fuso do restaurante) em que a comanda fechou. */
const diaDoFechamento = sql`(${tabs.closedAt} at time zone ${sql.raw(`'${FUSO}'`)})::date`;

/** Hoje (AAAA-MM-DD) no fuso do restaurante. */
export function hojeNoFuso(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

/**
 * Números do dia para a tela Início. Tudo agregado no banco, filtrando por company_id da sessão.
 * Venda = pedido de balcão/vitrine não cancelado (pelo dia do pedido) + comanda fechada no dia
 * (pelo total congelado). As rodadas da mesa ficam de fora da soma para a mesa não contar duas vezes.
 */
@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private readonly db: Database | null) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  async summary(companyId: string, data?: string): Promise<DashboardSummary> {
    const db = this.conn;
    const dia = data ?? hojeNoFuso();

    const daEmpresa = eq(orders.companyId, companyId);
    const doDia = sql`${orders.day} = ${dia}::date`;

    const [porOrigem, mesas, canceladosDia, abertas, fila, maisVendidos, semana] = await Promise.all([
      // Balcão e vitrine (pedidos sem comanda).
      db
        .select({
          origin: orders.origin,
          n: sql<number>`(count(*) filter (where ${orders.status} <> 'cancelado'))::int`,
          total: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} <> 'cancelado'), 0)::int`,
          desconto: sql<number>`coalesce(sum(${orders.discountCents}) filter (where ${orders.status} <> 'cancelado'), 0)::int`,
        })
        .from(orders)
        .where(and(daEmpresa, doDia, isNull(orders.tabId)))
        .groupBy(orders.origin),
      // Comandas fechadas no dia.
      db
        .select({ n: count(), total: soma(tabs.closedTotalCents), taxa: soma(tabs.closedServiceFeeCents) })
        .from(tabs)
        .where(and(eq(tabs.companyId, companyId), eq(tabs.status, "fechada"), sql`${diaDoFechamento} = ${dia}::date`)),
      // Cancelados no dia, de qualquer origem (inclui rodada de mesa cancelada inteira).
      db
        .select({ n: count(), total: soma(orders.totalCents) })
        .from(orders)
        .where(and(daEmpresa, doDia, eq(orders.status, "cancelado"))),
      // Mesas abertas agora: consumo ativo + taxa de cada comanda.
      db
        .select({
          tabId: tabs.id,
          bps: tabs.serviceFeeBps,
          sub: sql<number>`coalesce(sum(${orderItems.totalCents}) filter (where ${orderItems.cancelledAt} is null and ${orders.status} <> 'cancelado'), 0)::int`,
        })
        .from(tabs)
        .leftJoin(orders, and(eq(orders.companyId, tabs.companyId), eq(orders.tabId, tabs.id)))
        .leftJoin(orderItems, and(eq(orderItems.companyId, orders.companyId), eq(orderItems.orderId, orders.id)))
        .where(and(eq(tabs.companyId, companyId), eq(tabs.status, "aberta")))
        .groupBy(tabs.id, tabs.serviceFeeBps),
      db
        .select({ n: count() })
        .from(orders)
        .where(and(daEmpresa, inArray(orders.status, ["novo", "preparo"]))),
      db
        .select({ name: orderItems.name, quantidade: soma(orderItems.quantity), total: soma(orderItems.totalCents) })
        .from(orderItems)
        .innerJoin(orders, and(eq(orders.companyId, orderItems.companyId), eq(orders.id, orderItems.orderId)))
        .where(and(daEmpresa, doDia, ne(orders.status, "cancelado"), isNull(orderItems.cancelledAt)))
        .groupBy(orderItems.name)
        .orderBy(desc(sql`2`), desc(sql`3`), orderItems.name)
        .limit(5),
      this.semana(companyId, dia),
    ]);

    const origem = (o: "balcao" | "vitrine") => {
      const r = porOrigem.find((x) => x.origin === o);
      return { count: r?.n ?? 0, totalCents: r?.total ?? 0 };
    };
    const balcao = origem("balcao");
    const vitrine = origem("vitrine");
    const mesa = { count: mesas[0]?.n ?? 0, totalCents: mesas[0]?.total ?? 0 };
    const salesCents = balcao.totalCents + vitrine.totalCents + mesa.totalCents;
    const salesCount = balcao.count + vitrine.count + mesa.count;

    return {
      date: dia,
      salesCents,
      salesCount,
      averageTicketCents: salesCount ? Math.round(salesCents / salesCount) : 0,
      serviceFeeCents: mesas[0]?.taxa ?? 0,
      discountCents: porOrigem.reduce((s, r) => s + r.desconto, 0),
      byOrigin: { balcao, vitrine, mesa },
      cancelled: { count: canceladosDia[0]?.n ?? 0, totalCents: canceladosDia[0]?.total ?? 0 },
      openTabs: {
        count: abertas.length,
        totalCents: abertas.reduce((s, t) => s + t.sub + Math.round((t.sub * t.bps) / 10_000), 0),
      },
      kitchenQueue: fila[0]?.n ?? 0,
      topItems: maisVendidos.map((i) => ({ name: i.name, quantity: i.quantidade, totalCents: i.total })),
      last7Days: semana,
    };
  }

  /** Vendas por dia nos 7 dias terminando em `dia` (dias sem venda aparecem com zero). */
  private async semana(companyId: string, dia: string): Promise<{ date: string; salesCents: number }[]> {
    const db = this.conn;
    const inicio = sql`(${dia}::date - 6)`;
    const [pedidos, comandas] = await Promise.all([
      db
        .select({ d: sql<string>`${orders.day}::text`, total: soma(orders.totalCents) })
        .from(orders)
        .where(
          and(
            eq(orders.companyId, companyId),
            isNull(orders.tabId),
            ne(orders.status, "cancelado"),
            sql`${orders.day} between ${inicio} and ${dia}::date`,
          ),
        )
        .groupBy(orders.day),
      db
        .select({ d: sql<string>`${diaDoFechamento}::text`, total: soma(tabs.closedTotalCents) })
        .from(tabs)
        .where(
          and(eq(tabs.companyId, companyId), eq(tabs.status, "fechada"), sql`${diaDoFechamento} between ${inicio} and ${dia}::date`),
        )
        .groupBy(diaDoFechamento),
    ]);
    const base = new Date(`${dia}T12:00:00Z`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() - (6 - i));
      const date = d.toISOString().slice(0, 10);
      const salesCents =
        (pedidos.find((p) => p.d === date)?.total ?? 0) + (comandas.find((c) => c.d === date)?.total ?? 0);
      return { date, salesCents };
    });
  }
}
