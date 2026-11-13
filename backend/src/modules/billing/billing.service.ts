import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import type {
  BillingMonth,
  BillingStatus,
  Invoice,
  payInvoiceSchema,
  Subscription,
  subscriptionInputSchema,
} from "@mesaflow/shared";
import type { z } from "zod";
import { DB, type Database } from "../../db/database.module.js";
import { companies, invoices, subscriptions } from "../../db/schema.js";
import { hojeNoFuso } from "../dashboard/dashboard.service.js";

type Linha = typeof invoices.$inferSelect;

const naoEncontrada = () => new NotFoundException({ statusCode: 404, message: "Fatura não encontrada." });
const conflito = (message: string) => new ConflictException({ statusCode: 409, message });

/** Dias entre duas datas AAAA-MM-DD. */
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/** Atrasada = pendente com vencimento antes de hoje (São Paulo). Vencendo hoje ainda não está atrasada. */
const atraso = (status: string, vencimento: string, hoje: string) => (status === "pending" && vencimento < hoje ? diasEntre(vencimento, hoje) : 0);

function paraApi(f: Linha, hoje: string): Invoice {
  return {
    id: f.id,
    reference: f.reference,
    plan: f.plan,
    amountCents: f.amountCents,
    dueDate: f.dueDate,
    status: f.status,
    paidAt: f.paidAt?.toISOString() ?? null,
    paymentMethod: f.paymentMethod,
    note: f.note,
    daysLate: atraso(f.status, f.dueDate, hoje),
  };
}

/**
 * Cobrança manual: o admin define o plano de cada restaurante, gera as faturas do mês (pode repetir
 * sem duplicar), marca como pagas, cancela ou desfaz. Nada bloqueia sozinho: o bloqueio continua
 * sendo o botão do admin. Faturas nunca são apagadas.
 */
@Injectable()
export class BillingService {
  constructor(@Inject(DB) private readonly db: Database | null) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  async month(mes?: string, hoje = hojeNoFuso()): Promise<BillingMonth> {
    const month = mes ?? hoje.slice(0, 7);
    const reference = `${month}-01`;
    const linhas = await this.conn
      .select({ company: companies, subscription: subscriptions, invoice: invoices })
      .from(companies)
      .leftJoin(subscriptions, eq(subscriptions.companyId, companies.id))
      .leftJoin(invoices, and(eq(invoices.companyId, companies.id), eq(invoices.reference, reference)))
      .orderBy(asc(companies.name));
    const atrasadas = await this.conn
      .select({ companyId: invoices.companyId, amountCents: invoices.amountCents, dueDate: invoices.dueDate })
      .from(invoices)
      .where(and(eq(invoices.status, "pending"), lt(invoices.dueDate, hoje)));

    const rows = linhas.map(({ company, subscription, invoice }) => {
      const minhas = atrasadas.filter((a) => a.companyId === company.id);
      return {
        company: { id: company.id, code: company.code, name: company.name, status: company.status },
        subscription: subscription
          ? { plan: subscription.plan, priceCents: subscription.priceCents, dueDay: subscription.dueDay }
          : null,
        invoice: invoice ? paraApi(invoice, hoje) : null,
        overdue: {
          count: minhas.length,
          totalCents: minhas.reduce((s, a) => s + a.amountCents, 0),
          maxDaysLate: Math.max(0, ...minhas.map((a) => diasEntre(a.dueDate, hoje))),
        },
      };
    });
    const doMes = rows.flatMap((r) => (r.invoice ? [r.invoice] : []));
    return {
      month,
      rows,
      totals: {
        paidCents: doMes.filter((f) => f.status === "paid").reduce((s, f) => s + f.amountCents, 0),
        pendingCents: doMes.filter((f) => f.status === "pending").reduce((s, f) => s + f.amountCents, 0),
        overdueCents: atrasadas.reduce((s, a) => s + a.amountCents, 0),
      },
    };
  }

  async setSubscription(companyId: string, dados: z.output<typeof subscriptionInputSchema>): Promise<Subscription> {
    const [existe] = await this.conn.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId));
    if (!existe) throw new NotFoundException({ statusCode: 404, message: "Restaurante não encontrado." });
    const [s] = await this.conn
      .insert(subscriptions)
      .values({ companyId, ...dados })
      .onConflictDoUpdate({ target: subscriptions.companyId, set: { ...dados, updatedAt: new Date() } })
      .returning({ plan: subscriptions.plan, priceCents: subscriptions.priceCents, dueDay: subscriptions.dueDay });
    return s!;
  }

  /**
   * Faturas do mês para todo restaurante com plano (inclusive os bloqueados: a dívida continua existindo;
   * se não fizer sentido, o admin cancela). Quem já tem fatura no mês fica como está.
   */
  async generate(month: string): Promise<{ created: number }> {
    const planos = await this.conn.select().from(subscriptions);
    if (!planos.length) return { created: 0 };
    const criadas = await this.conn
      .insert(invoices)
      .values(
        planos.map((p) => ({
          companyId: p.companyId,
          reference: `${month}-01`,
          plan: p.plan,
          amountCents: p.priceCents,
          dueDate: `${month}-${String(p.dueDay).padStart(2, "0")}`,
        })),
      )
      .onConflictDoNothing({ target: [invoices.companyId, invoices.reference] })
      .returning({ id: invoices.id });
    return { created: criadas.length };
  }

  private async mudar(id: string, de: Linha["status"][], set: Partial<typeof invoices.$inferInsert>, erro: string): Promise<Invoice> {
    const [atual] = await this.conn.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, id));
    if (!atual) throw naoEncontrada();
    // Condicional no próprio UPDATE: dois admins clicando ao mesmo tempo não passam os dois.
    const [f] = await this.conn
      .update(invoices)
      .set({ ...set, updatedAt: new Date() })
      .where(and(eq(invoices.id, id), inArray(invoices.status, de)))
      .returning();
    if (!f) throw conflito(erro);
    return paraApi(f, hojeNoFuso());
  }

  pay(id: string, adminId: string, dados: z.output<typeof payInvoiceSchema>): Promise<Invoice> {
    return this.mudar(
      id,
      ["pending"],
      { status: "paid", paidAt: new Date(), paymentMethod: dados.method, note: dados.note, changedBy: adminId },
      "Esta fatura não está pendente. Atualize a tela.",
    );
  }

  cancel(id: string, adminId: string): Promise<Invoice> {
    return this.mudar(
      id,
      ["pending"],
      { status: "canceled", changedBy: adminId },
      "Só dá para cancelar fatura pendente. Se já foi paga, desfaça o pagamento antes.",
    );
  }

  /** Desfaz pagamento ou cancelamento: volta a pendente. */
  reopen(id: string, adminId: string): Promise<Invoice> {
    return this.mudar(
      id,
      ["paid", "canceled"],
      { status: "pending", paidAt: null, paymentMethod: null, note: "", changedBy: adminId },
      "Esta fatura já está pendente.",
    );
  }

  /** Para o restaurante: só as mensalidades atrasadas dele. */
  async status(companyId: string, hoje = hojeNoFuso()): Promise<BillingStatus> {
    const linhas = await this.conn
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.status, "pending"), lt(invoices.dueDate, hoje)))
      .orderBy(asc(invoices.dueDate));
    return {
      overdue: linhas.map((f) => ({
        reference: f.reference,
        amountCents: f.amountCents,
        dueDate: f.dueDate,
        daysLate: diasEntre(f.dueDate, hoje),
      })),
    };
  }
}
