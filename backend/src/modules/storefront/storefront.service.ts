import { ConflictException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Order, PublicOrder, Storefront, storefrontOrderInputSchema } from "@mesaflow/shared";
import type { z } from "zod";
import { DB, type Database } from "../../db/database.module.js";
import { companies } from "../../db/schema.js";
import type { Falta } from "../stock/stock.service.js";
import { OrdersService } from "../orders/orders.service.js";
import { PlanLimitsService } from "../plan-limits/plan-limits.service.js";

type PedidoVitrine = z.output<typeof storefrontOrderInputSchema>;

const indisponivel = () =>
  new NotFoundException({ statusCode: 404, message: "Este cardápio não existe ou está fora do ar no momento." });

/** Rotas públicas da vitrine: o cliente vê o cardápio, faz o pedido e acompanha, sem login. */
@Injectable()
export class StorefrontService {
  constructor(
    @Inject(DB) private readonly db: Database | null,
    private readonly orders: OrdersService,
    private readonly limites: PlanLimitsService,
  ) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  /** Restaurante ativo pelo código; bloqueado ou inexistente dá a mesma resposta (não revela o motivo). */
  private async loja(code: string) {
    const [loja] = await this.conn
      .select({ id: companies.id, code: companies.code, name: companies.name, whatsapp: companies.whatsapp })
      .from(companies)
      .where(and(eq(companies.code, code), eq(companies.status, "active")));
    // Plano sem cardápio online: a vitrine fica fora do ar, com a mesma resposta de restaurante bloqueado.
    if (!loja || !(await this.limites.moduloLigado(loja.id, "storefront"))) throw indisponivel();
    return loja;
  }

  async show(code: string): Promise<Storefront> {
    const { id, ...company } = await this.loja(code);
    return { company, menu: await this.orders.menu(id) };
  }

  async order(code: string, data: PedidoVitrine): Promise<{ order: PublicOrder; created: boolean }> {
    const { id: companyId, ...company } = await this.loja(code);
    try {
      const { order, created } = await this.orders.registrar(companyId, null, {
        ...data,
        origin: "vitrine",
        discount: null,
      });
      return { order: publico(order, company), created };
    } catch (erro) {
      // Para o cliente, sem saldos internos: só o nome do que acabou.
      const corpo = erro instanceof HttpException ? (erro.getResponse() as { shortages?: Falta[] }) : null;
      if (erro instanceof ConflictException && corpo?.shortages) {
        const nomes = corpo.shortages.map((f) => f.name.toLowerCase()).join(", ");
        throw new ConflictException({
          statusCode: 409,
          message: `Acabou ${nomes} agora há pouco. Tire o item do pedido ou escolha outro.`,
        });
      }
      throw erro;
    }
  }

  async track(code: string, id: string): Promise<PublicOrder> {
    const { id: companyId, ...company } = await this.loja(code);
    const order = await this.orders.find(companyId, id);
    if (!order) throw new NotFoundException({ statusCode: 404, message: "Pedido não encontrado." });
    return publico(order, company);
  }
}

function publico(o: Order, company: PublicOrder["company"]): PublicOrder {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    customerName: o.customerName,
    notes: o.notes,
    paymentMethod: o.paymentMethod,
    totalCents: o.totalCents,
    createdAt: o.createdAt,
    statusChangedAt: o.statusChangedAt,
    cancelReason: o.cancelReason,
    items: o.items,
    company,
  };
}
