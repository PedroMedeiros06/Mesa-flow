import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type {
  AdminPlan,
  AdminPlanAddon,
  planAddonInputSchema,
  PlanResource,
  PlanSaved,
  planInputSchema,
  PublicPlan,
  PublicPlanAddon,
} from "@mesaflow/shared";
import type { z } from "zod";
import { DB, type Database } from "../../db/database.module.js";
import { addons, plans, subscriptionAddons, subscriptions } from "../../db/schema.js";

type Entrada = z.output<typeof planInputSchema>;

function restricao(erro: unknown): string | undefined {
  const e = erro as { constraint_name?: string; constraint?: string; cause?: { constraint_name?: string; constraint?: string } };
  return e.constraint_name ?? e.constraint ?? e.cause?.constraint_name ?? e.cause?.constraint;
}

const nomeRepetido = () => new ConflictException({ statusCode: 409, message: "Já existe um plano com este nome." });
const naoEncontrado = () => new NotFoundException({ statusCode: 404, message: "Plano não encontrado." });

const publico = (p: typeof plans.$inferSelect): PublicPlan => ({
  id: p.id,
  name: p.name,
  priceCents: p.priceCents,
  description: p.description,
  features: p.features,
  highlighted: p.highlighted,
  limits: { tables: p.maxTables, members: p.maxMembers, products: p.maxProducts },
  modules: { tabs: p.featureTabs, stock: p.featureStock, storefront: p.featureStorefront },
});

/** Campos de limite e recurso da entrada para as colunas. */
const colunasLimites = (d: Entrada) => ({
  maxTables: d.limits.tables,
  maxMembers: d.limits.members,
  maxProducts: d.limits.products,
  featureTabs: d.modules.tabs,
  featureStock: d.modules.stock,
  featureStorefront: d.modules.storefront,
});

/**
 * Catálogo de planos: o admin edita, o site mostra os ativos e a Cobrança escolhe deles.
 * Os itens são só texto (não bloqueiam recurso). Plano não é apagado: desativar tira do site.
 */
@Injectable()
export class PlansService {
  constructor(@Inject(DB) private readonly db: Database | null) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  async publicList(): Promise<PublicPlan[]> {
    const linhas = await this.conn.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.position), asc(plans.name));
    return linhas.map(publico);
  }

  async adminList(): Promise<AdminPlan[]> {
    const linhas = await this.conn
      .select({
        plan: plans,
        // Colunas do plano citadas com a tabela: sem isso, "price_cents" dentro da subconsulta seria o da assinatura.
        subscribers: sql<number>`(select count(*)::int from ${subscriptions} s where s.plan_id = "plans"."id")`,
        outroValor: sql<number>`(select count(*)::int from ${subscriptions} s where s.plan_id = "plans"."id" and s.price_cents <> "plans"."price_cents")`,
      })
      .from(plans)
      .orderBy(asc(plans.position), asc(plans.name));
    return linhas.map(({ plan, subscribers, outroValor }) => ({
      ...publico(plan),
      active: plan.active,
      position: plan.position,
      subscribers,
      subscribersWithOtherPrice: outroValor,
    }));
  }

  private async um(id: string): Promise<AdminPlan> {
    const p = (await this.adminList()).find((x) => x.id === id);
    if (!p) throw naoEncontrado();
    return p;
  }

  async create(dados: Entrada): Promise<PlanSaved> {
    try {
      const id = await this.conn.transaction(async (tx) => {
        const [{ ultimo }] = (await tx.select({ ultimo: sql<number>`coalesce(max(${plans.position}), 0)::int` }).from(plans)) as [
          { ultimo: number },
        ];
        const [p] = await tx
          .insert(plans)
          .values({
            name: dados.name,
            priceCents: dados.priceCents,
            description: dados.description,
            features: dados.features,
            highlighted: dados.highlighted,
            active: dados.active,
            position: ultimo + 1,
            ...colunasLimites(dados),
          })
          .returning({ id: plans.id });
        // Um destaque só no site.
        if (dados.highlighted) await tx.update(plans).set({ highlighted: false }).where(ne(plans.id, p!.id));
        return p!.id;
      });
      return { plan: await this.um(id), updatedSubscriptions: 0 };
    } catch (erro) {
      if (restricao(erro) === "plans_name") throw nomeRepetido();
      throw erro;
    }
  }

  /**
   * Edita o plano. O nome novo vai para as assinaturas ligadas a ele (é só o rótulo).
   * O valor novo só vai para os restaurantes do plano se applyPriceToSubscribers vier true;
   * faturas já geradas nunca mudam.
   */
  async update(id: string, dados: Entrada): Promise<PlanSaved> {
    try {
      const atualizadas = await this.conn.transaction(async (tx) => {
        const [p] = await tx
          .update(plans)
          .set({
            name: dados.name,
            priceCents: dados.priceCents,
            description: dados.description,
            features: dados.features,
            highlighted: dados.highlighted,
            active: dados.active,
            ...colunasLimites(dados),
            updatedAt: new Date(),
          })
          .where(eq(plans.id, id))
          .returning({ id: plans.id });
        if (!p) throw naoEncontrado();
        if (dados.highlighted) await tx.update(plans).set({ highlighted: false }).where(ne(plans.id, id));
        await tx.update(subscriptions).set({ plan: dados.name, updatedAt: new Date() }).where(eq(subscriptions.planId, id));
        if (!dados.applyPriceToSubscribers) return 0;
        const mudadas = await tx
          .update(subscriptions)
          .set({ priceCents: dados.priceCents, updatedAt: new Date() })
          .where(and(eq(subscriptions.planId, id), ne(subscriptions.priceCents, dados.priceCents)))
          .returning({ id: subscriptions.companyId });
        return mudadas.length;
      });
      return { plan: await this.um(id), updatedSubscriptions: atualizadas };
    } catch (erro) {
      if (restricao(erro) === "plans_name") throw nomeRepetido();
      throw erro;
    }
  }

  /** Nova ordem dos planos (no site e no admin), na ordem dos ids recebidos. */
  async reorder(ids: string[]): Promise<AdminPlan[]> {
    await this.conn.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) await tx.update(plans).set({ position: i + 1 }).where(eq(plans.id, id));
    });
    return this.adminList();
  }

  /** Para a Cobrança: confere que o plano existe e devolve o nome. */
  async nome(id: string): Promise<string> {
    const [p] = await this.conn.select({ name: plans.name }).from(plans).where(eq(plans.id, id));
    if (!p) throw new NotFoundException({ statusCode: 404, message: "Plano não encontrado." });
    return p.name;
  }

  // ---------- produtos à parte (adicionais) ----------

  private addonPublico(a: typeof addons.$inferSelect): PublicPlanAddon {
    return { id: a.id, name: a.name, resource: a.resource as PlanResource, amount: a.amount, priceCents: a.priceCents };
  }

  async publicAddons(): Promise<PublicPlanAddon[]> {
    const linhas = await this.conn.select().from(addons).where(eq(addons.active, true)).orderBy(asc(addons.position), asc(addons.name));
    return linhas.map((a) => this.addonPublico(a));
  }

  async adminAddons(): Promise<AdminPlanAddon[]> {
    const linhas = await this.conn
      .select({
        addon: addons,
        // Coluna do adicional citada com a tabela (sem join, o drizzle escreveria só "price_cents").
        subscribers: sql<number>`(select count(*)::int from ${subscriptionAddons} s where s.addon_id = "addons"."id")`,
        outroValor: sql<number>`(select count(*)::int from ${subscriptionAddons} s where s.addon_id = "addons"."id" and s.unit_price_cents <> "addons"."price_cents")`,
      })
      .from(addons)
      .orderBy(asc(addons.position), asc(addons.name));
    return linhas.map(({ addon, subscribers, outroValor }) => ({
      ...this.addonPublico(addon),
      active: addon.active,
      position: addon.position,
      subscribers,
      subscribersWithOtherPrice: outroValor,
    }));
  }

  private async umAddon(id: string): Promise<AdminPlanAddon> {
    const a = (await this.adminAddons()).find((x) => x.id === id);
    if (!a) throw new NotFoundException({ statusCode: 404, message: "Adicional não encontrado." });
    return a;
  }

  async createAddon(dados: z.output<typeof planAddonInputSchema>): Promise<{ addon: AdminPlanAddon; updatedSubscriptions: number }> {
    try {
      const [{ ultimo }] = (await this.conn.select({ ultimo: sql<number>`coalesce(max(${addons.position}), 0)::int` }).from(addons)) as [
        { ultimo: number },
      ];
      const [a] = await this.conn
        .insert(addons)
        .values({ name: dados.name, resource: dados.resource, amount: dados.amount, priceCents: dados.priceCents, active: dados.active, position: ultimo + 1 })
        .returning({ id: addons.id });
      return { addon: await this.umAddon(a!.id), updatedSubscriptions: 0 };
    } catch (erro) {
      if (restricao(erro) === "addons_name") throw new ConflictException({ statusCode: 409, message: "Já existe um adicional com este nome." });
      throw erro;
    }
  }

  /** Como nos planos: o valor novo só vai para quem já tem o pacote se applyPriceToSubscribers vier true. */
  async updateAddon(id: string, dados: z.output<typeof planAddonInputSchema>): Promise<{ addon: AdminPlanAddon; updatedSubscriptions: number }> {
    try {
      const n = await this.conn.transaction(async (tx) => {
        const [a] = await tx
          .update(addons)
          .set({ name: dados.name, resource: dados.resource, amount: dados.amount, priceCents: dados.priceCents, active: dados.active, updatedAt: new Date() })
          .where(eq(addons.id, id))
          .returning({ id: addons.id });
        if (!a) throw new NotFoundException({ statusCode: 404, message: "Adicional não encontrado." });
        if (!dados.applyPriceToSubscribers) return 0;
        const mudadas = await tx
          .update(subscriptionAddons)
          .set({ unitPriceCents: dados.priceCents, updatedAt: new Date() })
          .where(and(eq(subscriptionAddons.addonId, id), ne(subscriptionAddons.unitPriceCents, dados.priceCents)))
          .returning({ id: subscriptionAddons.companyId });
        return mudadas.length;
      });
      return { addon: await this.umAddon(id), updatedSubscriptions: n };
    } catch (erro) {
      if (restricao(erro) === "addons_name") throw new ConflictException({ statusCode: 409, message: "Já existe um adicional com este nome." });
      throw erro;
    }
  }
}
