import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ACTIVE_STATUSES,
  can,
  MAX_CENTS,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  orderTotals,
  unitPrice,
  type cancelOrderSchema,
  type MemberProfile,
  type Order,
  type orderInputSchema,
  type OrderOrigin,
  type PaymentMethod,
  type SellableMenu,
  type StatusChange,
} from "@mesaflow/shared";
import type { z } from "zod";
import { DB, type Database, type Transaction } from "../../db/database.module.js";
import {
  categories,
  ingredients,
  members,
  orderCounters,
  orderItems,
  orders,
  productAddons,
  productImages,
  productIngredients,
  products,
  tabs,
} from "../../db/schema.js";
import { StorageClient } from "../../storage/storage.client.js";
import { StockService, type Consumo } from "../stock/stock.service.js";

type OrderData = z.output<typeof orderInputSchema>;

/** O que qualquer canal (balcão, vitrine, mesa) manda para gravar um pedido. */
export type NovoPedido = Omit<OrderData, "customerName" | "paymentMethod"> & {
  origin: OrderOrigin;
  customerName: string;
  customerPhone: string;
  /** Rodada de mesa paga no fechamento da comanda: sem forma de pagamento no pedido. */
  paymentMethod: PaymentMethod | null;
  tabId?: string;
};

/** Roda dentro da transação do pedido, antes de tudo (a comanda usa para travar e conferir a mesa). */
export type AntesDeGravar = (tx: Transaction) => Promise<void>;
type CancelData = z.output<typeof cancelOrderSchema>;

/** Dia do pedido no fuso do restaurante (por enquanto todos em São Paulo). */
const HOJE = sql<string>`(now() at time zone 'America/Sao_Paulo')::date`;

const naoEncontrado = () => new NotFoundException({ statusCode: 404, message: "Pedido não encontrado." });

function invalido(path: string, message: string) {
  return new BadRequestException({ statusCode: 400, message: "Dados inválidos", issues: [{ path, message }] });
}

function restricao(erro: unknown): string | undefined {
  const e = erro as { constraint_name?: string; constraint?: string; cause?: { constraint_name?: string; constraint?: string } };
  return e.constraint_name ?? e.constraint ?? e.cause?.constraint_name ?? e.cause?.constraint;
}

/** Soma o consumo de vários itens num só (para baixar ou estornar de uma vez). */
function somar(consumos: Consumo[]): Consumo {
  const total = new Map<string, number>();
  for (const c of consumos.flat()) total.set(c.ingredientId, (total.get(c.ingredientId) ?? 0) + c.quantityMilli);
  return [...total].map(([ingredientId, quantityMilli]) => ({ ingredientId, quantityMilli }));
}

/** Pedidos de balcão: criar (preço e estoque no servidor), fila da cozinha, status e cancelamento. */
@Injectable()
export class OrdersService {
  constructor(
    @Inject(DB) private readonly db: Database | null,
    private readonly stock: StockService,
    private readonly storage: StorageClient,
  ) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  // ---------- cardápio para vender ----------

  async menu(companyId: string): Promise<SellableMenu> {
    const cats = await this.conn
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(and(eq(categories.companyId, companyId), eq(categories.active, true)))
      .orderBy(asc(categories.position), asc(categories.name));
    const prods = await this.conn
      .select()
      .from(products)
      .where(and(eq(products.companyId, companyId), eq(products.active, true)))
      .orderBy(asc(products.position), asc(products.name));
    const ids = prods.map((p) => p.id);
    const [addons, imgs, removiveis, obrigatorios] = ids.length
      ? await Promise.all([
          this.adicionaisAtivos(this.conn, companyId, ids),
          this.conn
            .select({ productId: productImages.productId, path: productImages.path })
            .from(productImages)
            .where(and(eq(productImages.companyId, companyId), inArray(productImages.productId, ids)))
            .orderBy(asc(productImages.position)),
          this.removiveis(this.conn, companyId, ids),
          // Ingredientes que não dá para tirar e cujo saldo não cobre uma unidade: produto esgotado.
          this.conn
            .select({ productId: productIngredients.productId })
            .from(productIngredients)
            .innerJoin(ingredients, eq(ingredients.id, productIngredients.ingredientId))
            .where(
              and(
                eq(productIngredients.companyId, companyId),
                inArray(productIngredients.productId, ids),
                eq(productIngredients.removable, false),
                sql`${ingredients.stockMilli} < ${productIngredients.quantityMilli}`,
              ),
            ),
        ])
      : [[], [], [], []];
    const esgotados = new Set(obrigatorios.map((o) => o.productId));

    return {
      categories: cats
        .map((c) => ({
          id: c.id,
          name: c.name,
          products: prods
            .filter((p) => p.categoryId === c.id)
            .map((p) => {
              const foto = imgs.find((i) => i.productId === p.id);
              return {
                id: p.id,
                name: p.name,
                description: p.description,
                priceCents: p.priceCents,
                promoPriceCents: p.promoPriceCents,
                imageUrl: foto ? this.storage.publicUrl(foto.path) : null,
                addons: addons.filter((a) => a.productId === p.id).map(({ id, name, priceCents }) => ({ id, name, priceCents })),
                removable: removiveis.filter((r) => r.productId === p.id).map(({ ingredientId, name }) => ({ ingredientId, name })),
                soldOut: esgotados.has(p.id),
              };
            }),
        }))
        .filter((c) => c.products.length > 0),
    };
  }

  private adicionaisAtivos(conn: Database | Transaction, companyId: string, productIds: string[]) {
    return conn
      .select({ id: productAddons.id, productId: productAddons.productId, name: productAddons.name, priceCents: productAddons.priceCents })
      .from(productAddons)
      .where(
        and(eq(productAddons.companyId, companyId), inArray(productAddons.productId, productIds), eq(productAddons.active, true)),
      )
      .orderBy(asc(productAddons.position));
  }

  private removiveis(conn: Database | Transaction, companyId: string, productIds: string[]) {
    return conn
      .select({ productId: productIngredients.productId, ingredientId: productIngredients.ingredientId, name: ingredients.name })
      .from(productIngredients)
      .innerJoin(ingredients, eq(ingredients.id, productIngredients.ingredientId))
      .where(
        and(
          eq(productIngredients.companyId, companyId),
          inArray(productIngredients.productId, productIds),
          eq(productIngredients.removable, true),
        ),
      )
      .orderBy(asc(productIngredients.position));
  }

  // ---------- criar ----------

  /** Cria o pedido. Se o mesmo clientRequestId já virou pedido, devolve esse (created = false). */
  async create(perfil: MemberProfile, data: OrderData): Promise<{ order: Order; created: boolean }> {
    const companyId = perfil.company.id;
    if (data.discount && !can(perfil.member.role, perfil.member.permissions, "orders.discount")) {
      throw new ForbiddenException("Você não tem permissão para dar desconto.");
    }
    return this.registrar(companyId, perfil.member.id, { ...data, origin: "balcao", customerPhone: "" });
  }

  /** Grava um pedido de qualquer canal, uma vez só por clientRequestId. memberId null = cliente pela vitrine. */
  async registrar(
    companyId: string,
    memberId: string | null,
    data: NovoPedido,
    antes?: AntesDeGravar,
  ): Promise<{ order: Order; created: boolean }> {
    const repetido = await this.porRequisicao(companyId, data.clientRequestId);
    if (repetido) return { order: repetido, created: false };

    try {
      const id = await this.conn.transaction(async (tx) => {
        await antes?.(tx);
        return this.gravar(tx, companyId, memberId, data);
      });
      return { order: await this.get(companyId, id), created: true };
    } catch (erro) {
      // Duas tentativas iguais ao mesmo tempo: a segunda esbarra no índice único e devolve a primeira.
      if (restricao(erro) === "orders_company_request") {
        const existente = await this.porRequisicao(companyId, data.clientRequestId);
        if (existente) return { order: existente, created: false };
      }
      throw erro;
    }
  }

  private async gravar(tx: Transaction, companyId: string, memberId: string | null, data: NovoPedido): Promise<string> {
    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const prods = await tx
      .select({ id: products.id, name: products.name, priceCents: products.priceCents, promoPriceCents: products.promoPriceCents })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(products.companyId, companyId),
          inArray(products.id, productIds),
          eq(products.active, true),
          eq(categories.active, true),
        ),
      );
    const addons = await this.adicionaisAtivos(tx, companyId, productIds);
    const removiveis = await this.removiveis(tx, companyId, productIds);

    const itens = [];
    for (const [i, item] of data.items.entries()) {
      const prod = prods.find((p) => p.id === item.productId);
      if (!prod) throw invalido(`items.${i}.productId`, "Um produto do pedido não está mais à venda. Atualize o cardápio.");
      const escolhidos = item.addonIds.map((addonId) => {
        const a = addons.find((x) => x.id === addonId && x.productId === prod.id);
        if (!a) throw invalido(`items.${i}.addonIds`, `Um adicional de ${prod.name} não está mais disponível.`);
        return a;
      });
      // calcularConsumo também recusa tirar um ingrediente que não é opcional.
      const consumo = await this.stock.calcularConsumo(tx, companyId, [
        { productId: prod.id, quantity: item.quantity, removedIngredientIds: item.removedIngredientIds },
      ]);
      const unit = unitPrice(prod, escolhidos);
      itens.push({
        productId: prod.id,
        position: i,
        name: prod.name,
        quantity: item.quantity,
        unitPriceCents: unit,
        addons: escolhidos.map((a) => ({ name: a.name, priceCents: a.priceCents })),
        removed: item.removedIngredientIds.map(
          (rid) => removiveis.find((r) => r.productId === prod.id && r.ingredientId === rid)?.name ?? "",
        ),
        notes: item.notes,
        totalCents: unit * item.quantity,
        consumption: consumo,
      });
    }

    const totais = orderTotals(
      itens.map((i) => i.totalCents),
      data.discount,
    );
    if (totais.subtotalCents > MAX_CENTS * 10) throw invalido("items", "Pedido acima do limite. Divida em mais de um pedido.");

    let receivedCents: number | null = null;
    let changeCents = 0;
    if (data.paymentMethod === "dinheiro" && data.receivedCents !== null) {
      if (data.receivedCents < totais.totalCents) throw invalido("receivedCents", "O valor recebido é menor que o total.");
      receivedCents = data.receivedCents;
      changeCents = data.receivedCents - totais.totalCents;
    }

    const [contador] = await tx
      .insert(orderCounters)
      .values({ companyId, day: HOJE, last: 1 })
      .onConflictDoUpdate({ target: [orderCounters.companyId, orderCounters.day], set: { last: sql`${orderCounters.last} + 1` } })
      .returning({ day: orderCounters.day, last: orderCounters.last });

    const [pedido] = await tx
      .insert(orders)
      .values({
        companyId,
        day: contador!.day,
        number: contador!.last,
        origin: data.origin,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        notes: data.notes,
        paymentMethod: data.paymentMethod,
        ...totais,
        receivedCents,
        changeCents,
        clientRequestId: data.clientRequestId,
        tabId: data.tabId ?? null,
        createdBy: memberId,
      })
      .returning({ id: orders.id });
    await tx.insert(orderItems).values(itens.map((i) => ({ ...i, companyId, orderId: pedido!.id })));

    // Sem saldo, o StockService lança 409 com a lista do que falta e nada disto fica gravado.
    await this.stock.baixar(tx, companyId, memberId, somar(itens.map((i) => i.consumption)), `Pedido ${contador!.last}`);
    return pedido!.id;
  }

  // ---------- ler ----------

  /** Pedido ou null (sem 404), para quem precisa decidir a mensagem. */
  async find(companyId: string, id: string): Promise<Order | null> {
    const [order] = await this.buscar(companyId, [eq(orders.id, id)]);
    return order ?? null;
  }

  async get(companyId: string, id: string): Promise<Order> {
    const [order] = await this.buscar(companyId, [eq(orders.id, id)]);
    if (!order) throw naoEncontrado();
    return order;
  }

  private async porRequisicao(companyId: string, clientRequestId: string) {
    const [order] = await this.buscar(companyId, [eq(orders.clientRequestId, clientRequestId)]);
    return order ?? null;
  }

  /** Fila da cozinha: tudo que não foi entregue nem cancelado, do mais antigo para o mais novo. */
  queue(companyId: string) {
    return this.buscar(companyId, [inArray(orders.status, [...ACTIVE_STATUSES])], "fila");
  }

  /** Rodadas de uma comanda, da primeira para a última. */
  ofTab(companyId: string, tabId: string) {
    return this.buscar(companyId, [eq(orders.tabId, tabId)], "fila");
  }

  /** Pedidos de um dia (padrão: hoje), do mais novo para o mais antigo. */
  day(companyId: string, dia?: string) {
    return this.buscar(companyId, [eq(orders.day, dia ?? HOJE)], "dia");
  }

  private async buscar(companyId: string, filtros: ReturnType<typeof eq>[], ordem: "fila" | "dia" = "dia"): Promise<Order[]> {
    const rows = await this.conn
      .select({ o: orders, createdByName: members.name, tabLabel: tabs.label })
      .from(orders)
      .leftJoin(members, eq(members.id, orders.createdBy))
      .leftJoin(tabs, eq(tabs.id, orders.tabId))
      .where(and(eq(orders.companyId, companyId), ...filtros))
      .orderBy(...(ordem === "fila" ? [asc(orders.createdAt)] : [desc(orders.day), desc(orders.number)]))
      .limit(500);
    if (!rows.length) return [];
    const itens = await this.conn
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.companyId, companyId),
          inArray(
            orderItems.orderId,
            rows.map((r) => r.o.id),
          ),
        ),
      )
      .orderBy(asc(orderItems.position));
    return rows.map(({ o, createdByName, tabLabel }) => ({
      id: o.id,
      number: o.number,
      origin: o.origin,
      status: o.status,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      notes: o.notes,
      paymentMethod: o.paymentMethod,
      subtotalCents: o.subtotalCents,
      discountCents: o.discountCents,
      totalCents: o.totalCents,
      receivedCents: o.receivedCents,
      changeCents: o.changeCents,
      createdByName,
      createdAt: o.createdAt.toISOString(),
      statusChangedAt: o.statusChangedAt.toISOString(),
      cancelReason: o.cancelReason,
      tabId: o.tabId,
      tabLabel,
      items: itens
        .filter((i) => i.orderId === o.id)
        .map((i) => ({
          id: i.id,
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
          addons: i.addons,
          removed: i.removed,
          notes: i.notes,
          totalCents: i.totalCents,
          cancelled: i.cancelledAt !== null,
          cancelReason: i.cancelReason,
        })),
    }));
  }

  // ---------- status e cancelamento ----------

  async changeStatus(companyId: string, id: string, { from, to }: StatusChange): Promise<Order> {
    if (!ORDER_TRANSITIONS[from].includes(to)) {
      throw invalido("to", `Não dá para passar de ${ORDER_STATUS_LABELS[from]} para ${ORDER_STATUS_LABELS[to]}.`);
    }
    // Só muda se ainda estiver no status que a tela viu: duas telas não pulam etapas uma da outra.
    const mudou = await this.conn
      .update(orders)
      .set({ status: to, statusChangedAt: new Date() })
      .where(and(eq(orders.companyId, companyId), eq(orders.id, id), eq(orders.status, from)))
      .returning({ id: orders.id });
    if (!mudou.length) {
      const atual = await this.get(companyId, id);
      throw new ConflictException({
        statusCode: 409,
        message: `O pedido ${atual.number} já está como ${ORDER_STATUS_LABELS[atual.status]}. A lista foi atualizada.`,
      });
    }
    return this.get(companyId, id);
  }

  /** Cancela e devolve ao estoque exatamente o que saiu na venda. Pedido entregue não volta. */
  async cancel(companyId: string, memberId: string, id: string, { reason }: CancelData): Promise<Order> {
    await this.conn.transaction(async (tx) => {
      // UPDATE condicional: dois cancelamentos ao mesmo tempo só estornam uma vez.
      const [cancelado] = await tx
        .update(orders)
        .set({ status: "cancelado", statusChangedAt: new Date(), cancelledBy: memberId, cancelReason: reason })
        .where(and(eq(orders.companyId, companyId), eq(orders.id, id), inArray(orders.status, [...ACTIVE_STATUSES])))
        .returning({ number: orders.number });
      if (!cancelado) {
        // Lê pela própria transação: fora dela a conexão pode estar presa esperando esta.
        const [atual] = await tx
          .select({ number: orders.number, status: orders.status })
          .from(orders)
          .where(and(eq(orders.companyId, companyId), eq(orders.id, id)));
        if (!atual) throw naoEncontrado();
        throw new ConflictException({
          statusCode: 409,
          message:
            atual.status === "cancelado"
              ? `O pedido ${atual.number} já foi cancelado.`
              : `O pedido ${atual.number} já foi entregue e não pode ser cancelado.`,
        });
      }
      const itens = await tx
        .select({ consumption: orderItems.consumption })
        .from(orderItems)
        .where(and(eq(orderItems.companyId, companyId), eq(orderItems.orderId, id)));
      await this.stock.estornar(
        tx,
        companyId,
        memberId,
        somar(itens.map((i) => i.consumption)),
        `Pedido ${cancelado.number} cancelado`,
      );
    });
    return this.get(companyId, id);
  }
}
