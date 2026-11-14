import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { AdminPlan, PlanSaved, planInputSchema, PublicPlan } from "@mesaflow/shared";
import type { z } from "zod";
import { DB, type Database } from "../../db/database.module.js";
import { plans, subscriptions } from "../../db/schema.js";

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
}
