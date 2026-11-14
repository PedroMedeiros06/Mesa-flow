import { ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { count, eq, sql } from "drizzle-orm";
import {
  PLAN_RESOURCE_LABELS,
  SEM_LIMITES,
  TUDO_LIBERADO,
  type CompanyPlan,
  type PlanLimits,
  type PlanModule,
  type PlanModules,
} from "@mesaflow/shared";
import { DB, type Database, type Transaction } from "../../db/database.module.js";
import { addons, companies, members, plans, products, subscriptionAddons, subscriptions } from "../../db/schema.js";

type Conn = Database | Transaction;

export interface PlanoEfetivo {
  plan: string | null;
  limits: PlanLimits;
  modules: PlanModules;
}

const FALE = "Fale com a MesaFlow para aumentar.";

/** Como cada recurso aparece no meio da frase "Seu plano não inclui ...". */
const NO_PLANO: Record<PlanModule, string> = {
  tabs: "mesas e comandas",
  stock: "o controle de estoque",
  storefront: "o cardápio online",
};

/**
 * Fonte única dos limites do restaurante: plano + pacotes à parte. Sem assinatura, ou com assinatura
 * sem plano do catálogo, não há limite e tudo fica liberado. Passar do limite só impede criar coisa
 * nova; nada é apagado nem desativado.
 */
@Injectable()
export class PlanLimitsService {
  constructor(@Inject(DB) private readonly db: Database | null) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  async efetivo(companyId: string, conn: Conn = this.conn): Promise<PlanoEfetivo> {
    const [p] = await conn
      .select({ plan: plans })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.companyId, companyId));
    if (!p) return { plan: null, limits: SEM_LIMITES, modules: TUDO_LIBERADO };

    const extras = await conn
      .select({ resource: addons.resource, total: sql<number>`sum(${subscriptionAddons.quantity} * ${addons.amount})::int` })
      .from(subscriptionAddons)
      .innerJoin(addons, eq(addons.id, subscriptionAddons.addonId))
      .where(eq(subscriptionAddons.companyId, companyId))
      .groupBy(addons.resource);
    const extra = (r: string) => extras.find((e) => e.resource === r)?.total ?? 0;
    const somar = (base: number | null, r: string) => (base === null ? null : base + extra(r));

    return {
      plan: p.plan.name,
      limits: {
        tables: somar(p.plan.maxTables, "tables"),
        members: somar(p.plan.maxMembers, "members"),
        products: somar(p.plan.maxProducts, "products"),
      },
      modules: { tabs: p.plan.featureTabs, stock: p.plan.featureStock, storefront: p.plan.featureStorefront },
    };
  }

  /** 403 com mensagem clara quando o plano não inclui o recurso. */
  async exigirModulo(companyId: string, modulo: PlanModule, conn: Conn = this.conn): Promise<void> {
    const { modules } = await this.efetivo(companyId, conn);
    if (!modules[modulo]) {
      throw new ForbiddenException({
        statusCode: 403,
        message: `Seu plano não inclui ${NO_PLANO[modulo]}. Fale com a MesaFlow para liberar.`,
      });
    }
  }

  /** Recurso desligado em rota pública (vitrine, página da mesa): responde como se não existisse. */
  async moduloLigado(companyId: string, modulo: PlanModule): Promise<boolean> {
    return (await this.efetivo(companyId)).modules[modulo];
  }

  /** Mesa acima do limite do plano (mesas sem número não contam). */
  async exigirMesa(companyId: string, tableNumber: number | null | undefined, conn: Conn = this.conn): Promise<void> {
    if (tableNumber === null || tableNumber === undefined) return;
    const { limits } = await this.efetivo(companyId, conn);
    if (limits.tables !== null && tableNumber > limits.tables) {
      throw new ForbiddenException({
        statusCode: 403,
        message: `Seu plano permite até a mesa ${limits.tables}. ${FALE}`,
      });
    }
  }

  /** Limite de mesas para quem gera QR em lote. */
  async limiteMesas(companyId: string): Promise<number | null> {
    return (await this.efetivo(companyId)).limits.tables;
  }

  /**
   * Confere se cabe mais uma pessoa ou mais um produto. Dentro de uma transação, trava a linha do
   * restaurante antes de contar: dois cadastros ao mesmo tempo não passam juntos do limite.
   * Conta tudo (inclusive bloqueados e inativos), senão bloquear ou desativar driblaria o limite.
   */
  async exigirVaga(companyId: string, recurso: "members" | "products", tx: Conn = this.conn): Promise<void> {
    const { limits } = await this.efetivo(companyId, tx);
    const limite = limits[recurso];
    if (limite === null) return;
    await tx.execute(sql`select 1 from ${companies} where ${companies.id} = ${companyId} for update`);
    const tabela = recurso === "members" ? members : products;
    const [{ n }] = (await tx.select({ n: count() }).from(tabela).where(eq(tabela.companyId, companyId))) as [{ n: number }];
    if (n >= limite) {
      const { plural } = PLAN_RESOURCE_LABELS[recurso];
      throw new ForbiddenException({ statusCode: 403, message: `Seu plano permite até ${limite} ${plural}. ${FALE}` });
    }
  }

  /** O plano como o restaurante vê em Ajustes. */
  async doRestaurante(companyId: string): Promise<CompanyPlan> {
    const [existe] = await this.conn.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId));
    if (!existe) throw new NotFoundException({ statusCode: 404, message: "Restaurante não encontrado." });
    const efetivo = await this.efetivo(companyId);
    const [[m], [p], pacotes] = await Promise.all([
      this.conn.select({ n: count() }).from(members).where(eq(members.companyId, companyId)),
      this.conn.select({ n: count() }).from(products).where(eq(products.companyId, companyId)),
      this.conn
        .select({ name: addons.name, quantity: subscriptionAddons.quantity })
        .from(subscriptionAddons)
        .innerJoin(addons, eq(addons.id, subscriptionAddons.addonId))
        .where(eq(subscriptionAddons.companyId, companyId)),
    ]);
    return { ...efetivo, usage: { members: m!.n, products: p!.n }, addons: pacotes };
  }
}
