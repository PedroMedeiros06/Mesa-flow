import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  Ingredient,
  ingredientCreateSchema,
  ingredientInputSchema,
  Movement,
  MovementKind,
  movementInputSchema,
} from "@mesaflow/shared";
import type { z } from "zod";
import { DB, type Database, type Transaction } from "../../db/database.module.js";
import { ingredients, members, productIngredients, products, stockMovements } from "../../db/schema.js";

type CreateData = z.output<typeof ingredientCreateSchema>;
type UpdateData = z.output<typeof ingredientInputSchema>;
type MovementData = z.output<typeof movementInputSchema>;

/** Item vendido, como o pedido manda: produto, quantidade e ingredientes que o cliente tirou. */
export interface ItemVendido {
  productId: string;
  quantity: number;
  removedIngredientIds?: string[];
}

/** Consumo de uma venda, guardado junto do pedido para o estorno sair igual (mesmo que a ficha mude depois). */
export type Consumo = { ingredientId: string; quantityMilli: number }[];

function pgCode(erro: unknown): string | undefined {
  const e = erro as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}

const naoEncontrado = () => new NotFoundException({ statusCode: 404, message: "Ingrediente não encontrado." });

/** Ingredientes, ficha técnica e movimentos. Toda consulta filtra por company_id da sessão. */
@Injectable()
export class StockService {
  constructor(@Inject(DB) private readonly db: Database | null) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  // ---------- ingredientes ----------

  async list(companyId: string): Promise<Ingredient[]> {
    const usos = this.conn
      .select({ ingredientId: productIngredients.ingredientId, total: count().as("total") })
      .from(productIngredients)
      .where(eq(productIngredients.companyId, companyId))
      .groupBy(productIngredients.ingredientId)
      .as("usos");
    const rows = await this.conn
      .select({
        id: ingredients.id,
        name: ingredients.name,
        unit: ingredients.unit,
        stockMilli: ingredients.stockMilli,
        minStockMilli: ingredients.minStockMilli,
        usedIn: sql<number>`coalesce(${usos.total}, 0)::int`,
      })
      .from(ingredients)
      .leftJoin(usos, eq(usos.ingredientId, ingredients.id))
      .where(eq(ingredients.companyId, companyId))
      .orderBy(asc(ingredients.name));
    return rows;
  }

  private async one(companyId: string, id: string): Promise<Ingredient> {
    const item = (await this.list(companyId)).find((i) => i.id === id);
    if (!item) throw naoEncontrado();
    return item;
  }

  async create(companyId: string, memberId: string, data: CreateData): Promise<Ingredient> {
    try {
      const id = await this.conn.transaction(async (tx) => {
        const [ing] = await tx
          .insert(ingredients)
          .values({
            companyId,
            name: data.name,
            unit: data.unit,
            minStockMilli: data.minStockMilli,
            stockMilli: data.initialStockMilli,
          })
          .returning({ id: ingredients.id });
        if (data.initialStockMilli > 0) {
          await tx.insert(stockMovements).values({
            companyId,
            ingredientId: ing!.id,
            kind: "entrada",
            deltaMilli: data.initialStockMilli,
            balanceAfterMilli: data.initialStockMilli,
            reason: "Estoque inicial",
            memberId,
          });
        }
        return ing!.id;
      });
      return this.one(companyId, id);
    } catch (erro) {
      throw this.nomeRepetido(erro);
    }
  }

  async update(companyId: string, id: string, data: UpdateData): Promise<Ingredient> {
    const atual = await this.one(companyId, id);
    if (atual.unit !== data.unit && (atual.usedIn > 0 || atual.stockMilli !== 0)) {
      throw new ConflictException({
        statusCode: 409,
        message: "Só dá para trocar a unidade de um ingrediente zerado e fora das fichas técnicas.",
      });
    }
    try {
      await this.conn
        .update(ingredients)
        .set({ name: data.name, unit: data.unit, minStockMilli: data.minStockMilli })
        .where(and(eq(ingredients.companyId, companyId), eq(ingredients.id, id)));
    } catch (erro) {
      throw this.nomeRepetido(erro);
    }
    return this.one(companyId, id);
  }

  async delete(companyId: string, id: string): Promise<void> {
    const usados = await this.conn
      .select({ nome: products.name })
      .from(productIngredients)
      .innerJoin(products, eq(products.id, productIngredients.productId))
      .where(and(eq(productIngredients.companyId, companyId), eq(productIngredients.ingredientId, id)))
      .orderBy(asc(products.name));
    if (usados.length) {
      const nomes = usados.slice(0, 3).map((u) => u.nome).join(", ");
      const resto = usados.length > 3 ? ` e mais ${usados.length - 3}` : "";
      throw new ConflictException({
        statusCode: 409,
        message: `Este ingrediente está na ficha técnica de ${nomes}${resto}. Tire de lá antes de apagar.`,
      });
    }
    const apagados = await this.conn
      .delete(ingredients)
      .where(and(eq(ingredients.companyId, companyId), eq(ingredients.id, id)))
      .returning({ id: ingredients.id });
    if (!apagados.length) throw naoEncontrado();
  }

  // ---------- movimentos manuais ----------

  async move(companyId: string, memberId: string, id: string, data: MovementData): Promise<Ingredient> {
    await this.conn.transaction(async (tx) => {
      // Trava a linha: duas contagens ao mesmo tempo não se atropelam.
      const [atual] = await tx
        .select({ stockMilli: ingredients.stockMilli })
        .from(ingredients)
        .where(and(eq(ingredients.companyId, companyId), eq(ingredients.id, id)))
        .for("update");
      if (!atual) throw naoEncontrado();
      const delta =
        data.kind === "entrada"
          ? data.quantityMilli
          : data.kind === "perda"
            ? -data.quantityMilli
            : data.quantityMilli - atual.stockMilli;
      if (data.kind !== "contagem" && delta === 0) {
        throw new BadRequestException({
          statusCode: 400,
          message: "Dados inválidos",
          issues: [{ path: "quantityMilli", message: "A quantidade precisa ser maior que zero" }],
        });
      }
      await this.registrar(tx, companyId, memberId, [{ ingredientId: id, deltaMilli: delta }], data.kind, data.reason);
    });
    return this.one(companyId, id);
  }

  async movements(companyId: string, id: string): Promise<Movement[]> {
    await this.one(companyId, id);
    const rows = await this.conn
      .select({
        id: stockMovements.id,
        kind: stockMovements.kind,
        deltaMilli: stockMovements.deltaMilli,
        balanceAfterMilli: stockMovements.balanceAfterMilli,
        reason: stockMovements.reason,
        memberName: members.name,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .leftJoin(members, eq(members.id, stockMovements.memberId))
      .where(and(eq(stockMovements.companyId, companyId), eq(stockMovements.ingredientId, id)))
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(100);
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  // ---------- venda (usado pelos pedidos, sempre dentro da transação do pedido) ----------

  /** Quanto de cada ingrediente os itens consomem, pela ficha técnica atual. */
  async calcularConsumo(tx: Transaction, companyId: string, itens: ItemVendido[]): Promise<Consumo> {
    const ids = [...new Set(itens.map((i) => i.productId))];
    if (!ids.length) return [];
    const receita = await tx
      .select({
        productId: productIngredients.productId,
        ingredientId: productIngredients.ingredientId,
        quantityMilli: productIngredients.quantityMilli,
        removable: productIngredients.removable,
      })
      .from(productIngredients)
      .where(and(eq(productIngredients.companyId, companyId), inArray(productIngredients.productId, ids)));

    const total = new Map<string, number>();
    for (const item of itens) {
      const daFicha = receita.filter((r) => r.productId === item.productId);
      for (const tirado of item.removedIngredientIds ?? []) {
        if (!daFicha.some((r) => r.ingredientId === tirado && r.removable)) {
          throw new BadRequestException({
            statusCode: 400,
            message: "Este ingrediente não pode ser retirado do produto.",
          });
        }
      }
      for (const r of daFicha) {
        if (item.removedIngredientIds?.includes(r.ingredientId)) continue;
        total.set(r.ingredientId, (total.get(r.ingredientId) ?? 0) + r.quantityMilli * item.quantity);
      }
    }
    return [...total].map(([ingredientId, quantityMilli]) => ({ ingredientId, quantityMilli }));
  }

  /** Tira do estoque o consumo de uma venda e devolve o consumo para guardar no pedido. */
  async baixar(tx: Transaction, companyId: string, memberId: string | null, consumo: Consumo, motivo: string) {
    await this.registrar(
      tx,
      companyId,
      memberId,
      consumo.map((c) => ({ ingredientId: c.ingredientId, deltaMilli: -c.quantityMilli })),
      "venda",
      motivo,
    );
    return consumo;
  }

  /** Devolve ao estoque exatamente o consumo guardado na venda. */
  async estornar(tx: Transaction, companyId: string, memberId: string | null, consumo: Consumo, motivo: string) {
    await this.registrar(
      tx,
      companyId,
      memberId,
      consumo.map((c) => ({ ingredientId: c.ingredientId, deltaMilli: c.quantityMilli })),
      "estorno",
      motivo,
    );
  }

  /**
   * Soma no saldo com UPDATE atômico (sem ler antes) e grava o histórico.
   * Ordena por id para duas vendas simultâneas travarem as linhas na mesma ordem (sem deadlock).
   */
  private async registrar(
    tx: Transaction,
    companyId: string,
    memberId: string | null,
    deltas: { ingredientId: string; deltaMilli: number }[],
    kind: MovementKind,
    reason: string,
  ) {
    for (const d of [...deltas].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId))) {
      if (d.deltaMilli === 0 && kind !== "contagem") continue;
      const [ing] = await tx
        .update(ingredients)
        .set({ stockMilli: sql`${ingredients.stockMilli} + ${d.deltaMilli}` })
        .where(and(eq(ingredients.companyId, companyId), eq(ingredients.id, d.ingredientId)))
        .returning({ stockMilli: ingredients.stockMilli });
      if (!ing) throw naoEncontrado();
      await tx.insert(stockMovements).values({
        companyId,
        ingredientId: d.ingredientId,
        kind,
        deltaMilli: d.deltaMilli,
        balanceAfterMilli: ing.stockMilli,
        reason,
        memberId,
      });
    }
  }

  private nomeRepetido(erro: unknown) {
    if (pgCode(erro) === "23505") {
      return new ConflictException({ statusCode: 409, message: "Já existe um ingrediente com esse nome." });
    }
    return erro;
  }
}
