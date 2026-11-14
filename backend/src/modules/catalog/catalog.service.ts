import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, asc, count, eq, inArray, max } from "drizzle-orm";
import {
  MAX_PRODUCT_IMAGES,
  type Catalog,
  type IngredientOption,
  type categoryInputSchema,
  type Product,
  type productInputSchema,
} from "@mesaflow/shared";
import type { z } from "zod";
import { DB, type Database, type Transaction } from "../../db/database.module.js";
import {
  categories,
  ingredients,
  productAddons,
  productImages,
  productIngredients,
  products,
} from "../../db/schema.js";
import { detectImageType, StorageClient } from "../../storage/storage.client.js";
import { PlanLimitsService } from "../plan-limits/plan-limits.service.js";

type CategoryData = z.output<typeof categoryInputSchema>;
type ProductData = z.output<typeof productInputSchema>;

// Código de erro do Postgres, com ou sem o embrulho do Drizzle.
function pgCode(erro: unknown): string | undefined {
  const e = erro as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}

const naoEncontrado = (o: string) => new NotFoundException({ statusCode: 404, message: `${o} não encontrado.` });

/**
 * Cardápio do restaurante. Toda consulta filtra por company_id, que vem sempre da sessão.
 * Recurso de outro restaurante responde 404, como se não existisse.
 */
@Injectable()
export class CatalogService {
  constructor(
    @Inject(DB) private readonly db: Database | null,
    private readonly storage: StorageClient,
    private readonly limites: PlanLimitsService,
  ) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  // ---------- leitura ----------

  async catalog(companyId: string): Promise<Catalog> {
    const db = this.conn;
    const [cats, prods, addons, imgs, receita] = await Promise.all([
      db.select().from(categories).where(eq(categories.companyId, companyId)).orderBy(asc(categories.position), asc(categories.name)),
      db.select().from(products).where(eq(products.companyId, companyId)).orderBy(asc(products.position), asc(products.name)),
      db.select().from(productAddons).where(eq(productAddons.companyId, companyId)).orderBy(asc(productAddons.position)),
      db.select().from(productImages).where(eq(productImages.companyId, companyId)).orderBy(asc(productImages.position), asc(productImages.createdAt)),
      this.receitas(db, companyId),
    ]);
    const montados = this.montarProdutos(prods, addons, imgs, receita);
    return {
      categories: cats.map((c) => ({
        id: c.id,
        name: c.name,
        active: c.active,
        products: montados.filter((p) => p.categoryId === c.id),
      })),
    };
  }

  async product(companyId: string, productId: string, db: Database | Transaction = this.conn): Promise<Product> {
    const [prod] = await db
      .select()
      .from(products)
      .where(and(eq(products.companyId, companyId), eq(products.id, productId)));
    if (!prod) throw naoEncontrado("Produto");
    const [addons, imgs, receita] = await Promise.all([
      db.select().from(productAddons).where(and(eq(productAddons.companyId, companyId), eq(productAddons.productId, productId))).orderBy(asc(productAddons.position)),
      db.select().from(productImages).where(and(eq(productImages.companyId, companyId), eq(productImages.productId, productId))).orderBy(asc(productImages.position), asc(productImages.createdAt)),
      this.receitas(db, companyId, productId),
    ]);
    return this.montarProdutos([prod], addons, imgs, receita)[0]!;
  }

  private montarProdutos(
    prods: (typeof products.$inferSelect)[],
    addons: (typeof productAddons.$inferSelect)[],
    imgs: (typeof productImages.$inferSelect)[],
    receita: Awaited<ReturnType<CatalogService["receitas"]>>,
  ): Product[] {
    return prods.map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      promoPriceCents: p.promoPriceCents,
      active: p.active,
      addons: addons
        .filter((a) => a.productId === p.id)
        .map((a) => ({ id: a.id, name: a.name, priceCents: a.priceCents, active: a.active })),
      images: imgs.filter((i) => i.productId === p.id).map((i) => ({ id: i.id, url: this.storage.publicUrl(i.path) })),
      recipe: receita
        .filter((r) => r.productId === p.id)
        .map(({ ingredientId, name, unit, quantityMilli, removable }) => ({ ingredientId, name, unit, quantityMilli, removable })),
    }));
  }

  /** Ficha técnica com nome e unidade do ingrediente. */
  private receitas(db: Database | Transaction, companyId: string, productId?: string) {
    return db
      .select({
        productId: productIngredients.productId,
        ingredientId: productIngredients.ingredientId,
        name: ingredients.name,
        unit: ingredients.unit,
        quantityMilli: productIngredients.quantityMilli,
        removable: productIngredients.removable,
      })
      .from(productIngredients)
      .innerJoin(ingredients, eq(ingredients.id, productIngredients.ingredientId))
      .where(
        and(
          eq(productIngredients.companyId, companyId),
          productId ? eq(productIngredients.productId, productId) : undefined,
        ),
      )
      .orderBy(asc(productIngredients.position));
  }

  /** Ingredientes para montar a ficha técnica (só nome e unidade). */
  async ingredientOptions(companyId: string): Promise<IngredientOption[]> {
    return this.conn
      .select({ id: ingredients.id, name: ingredients.name, unit: ingredients.unit })
      .from(ingredients)
      .where(eq(ingredients.companyId, companyId))
      .orderBy(asc(ingredients.name));
  }

  // ---------- categorias ----------

  async createCategory(companyId: string, data: CategoryData) {
    const db = this.conn;
    const [{ ultima } = { ultima: null }] = await db
      .select({ ultima: max(categories.position) })
      .from(categories)
      .where(eq(categories.companyId, companyId));
    try {
      const [cat] = await db
        .insert(categories)
        .values({ companyId, name: data.name, active: data.active, position: (ultima ?? -1) + 1 })
        .returning();
      return { id: cat!.id, name: cat!.name, active: cat!.active, products: [] };
    } catch (erro) {
      throw this.nomeRepetido(erro);
    }
  }

  async updateCategory(companyId: string, id: string, data: CategoryData) {
    try {
      const [cat] = await this.conn
        .update(categories)
        .set({ name: data.name, active: data.active })
        .where(and(eq(categories.companyId, companyId), eq(categories.id, id)))
        .returning();
      if (!cat) throw naoEncontrado("Categoria");
      return { id: cat.id, name: cat.name, active: cat.active };
    } catch (erro) {
      throw this.nomeRepetido(erro);
    }
  }

  async deleteCategory(companyId: string, id: string): Promise<void> {
    const db = this.conn;
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(products)
      .where(and(eq(products.companyId, companyId), eq(products.categoryId, id)));
    if (total > 0) {
      throw new ConflictException({
        statusCode: 409,
        message: `Esta categoria tem ${total} produto${total > 1 ? "s" : ""}. Mova ou apague os produtos antes.`,
      });
    }
    const apagadas = await db
      .delete(categories)
      .where(and(eq(categories.companyId, companyId), eq(categories.id, id)))
      .returning({ id: categories.id });
    if (!apagadas.length) throw naoEncontrado("Categoria");
  }

  async reorderCategories(companyId: string, ids: string[]): Promise<void> {
    await this.conn.transaction(async (tx) => {
      const atuais = await tx.select({ id: categories.id }).from(categories).where(eq(categories.companyId, companyId));
      this.mesmaLista(atuais.map((c) => c.id), ids);
      for (const [position, id] of ids.entries()) {
        await tx
          .update(categories)
          .set({ position })
          .where(and(eq(categories.companyId, companyId), eq(categories.id, id)));
      }
    });
  }

  // ---------- produtos ----------

  async createProduct(companyId: string, data: ProductData): Promise<Product> {
    return this.conn.transaction(async (tx) => {
      await this.limites.exigirVaga(companyId, "products", tx);
      await this.exigirCategoria(tx, companyId, data.categoryId);
      const [prod] = await tx
        .insert(products)
        .values({
          companyId,
          categoryId: data.categoryId,
          name: data.name,
          description: data.description,
          priceCents: data.priceCents,
          promoPriceCents: data.promoPriceCents,
          active: data.active,
          position: await this.proximaPosicao(tx, companyId, data.categoryId),
        })
        .returning({ id: products.id });
      await this.gravarAdicionais(tx, companyId, prod!.id, data.addons);
      if (data.recipe) await this.gravarReceita(tx, companyId, prod!.id, data.recipe);
      return this.product(companyId, prod!.id, tx);
    });
  }

  async updateProduct(companyId: string, id: string, data: ProductData): Promise<Product> {
    return this.conn.transaction(async (tx) => {
      const [atual] = await tx
        .select({ categoryId: products.categoryId })
        .from(products)
        .where(and(eq(products.companyId, companyId), eq(products.id, id)))
        .for("update");
      if (!atual) throw naoEncontrado("Produto");
      const mudouCategoria = atual.categoryId !== data.categoryId;
      if (mudouCategoria) await this.exigirCategoria(tx, companyId, data.categoryId);
      await tx
        .update(products)
        .set({
          categoryId: data.categoryId,
          name: data.name,
          description: data.description,
          priceCents: data.priceCents,
          promoPriceCents: data.promoPriceCents,
          active: data.active,
          // Ao trocar de categoria, o produto vai para o fim da nova.
          ...(mudouCategoria ? { position: await this.proximaPosicao(tx, companyId, data.categoryId) } : {}),
        })
        .where(and(eq(products.companyId, companyId), eq(products.id, id)));
      await tx
        .delete(productAddons)
        .where(and(eq(productAddons.companyId, companyId), eq(productAddons.productId, id)));
      await this.gravarAdicionais(tx, companyId, id, data.addons);
      if (data.recipe) {
        await tx
          .delete(productIngredients)
          .where(and(eq(productIngredients.companyId, companyId), eq(productIngredients.productId, id)));
        await this.gravarReceita(tx, companyId, id, data.recipe);
      }
      return this.product(companyId, id, tx);
    });
  }

  async deleteProduct(companyId: string, id: string): Promise<void> {
    const paths = await this.conn.transaction(async (tx) => {
      const imgs = await tx
        .select({ path: productImages.path })
        .from(productImages)
        .where(and(eq(productImages.companyId, companyId), eq(productImages.productId, id)));
      const apagados = await tx
        .delete(products)
        .where(and(eq(products.companyId, companyId), eq(products.id, id)))
        .returning({ id: products.id });
      if (!apagados.length) throw naoEncontrado("Produto");
      return imgs.map((i) => i.path);
    });
    // Arquivos só saem depois que o banco confirmou.
    await this.storage.remove(paths);
  }

  async reorderProducts(companyId: string, categoryId: string, ids: string[]): Promise<void> {
    await this.conn.transaction(async (tx) => {
      const atuais = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.companyId, companyId), eq(products.categoryId, categoryId)));
      this.mesmaLista(atuais.map((p) => p.id), ids);
      for (const [position, id] of ids.entries()) {
        await tx
          .update(products)
          .set({ position })
          .where(and(eq(products.companyId, companyId), eq(products.id, id)));
      }
    });
  }

  // ---------- fotos ----------

  async addImage(companyId: string, productId: string, bytes: Buffer | undefined): Promise<Product> {
    if (!bytes?.length) throw new BadRequestException({ statusCode: 400, message: "Envie uma foto." });
    const tipo = detectImageType(bytes);
    if (!tipo) {
      throw new BadRequestException({ statusCode: 400, message: "Use uma foto em JPG, PNG ou WEBP." });
    }
    const db = this.conn;
    await this.product(companyId, productId);
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(productImages)
      .where(and(eq(productImages.companyId, companyId), eq(productImages.productId, productId)));
    if (total >= MAX_PRODUCT_IMAGES) {
      throw new ConflictException({
        statusCode: 409,
        message: `Cada produto pode ter até ${MAX_PRODUCT_IMAGES} fotos. Apague uma antes de enviar outra.`,
      });
    }

    const path = `${companyId}/${productId}/${randomUUID()}.${tipo.ext}`;
    await this.storage.upload(path, bytes, tipo.mime);
    try {
      await db.insert(productImages).values({ companyId, productId, path, position: total });
    } catch (erro) {
      // O banco não aceitou (ex.: produto apagado no meio do envio): não deixa o arquivo solto.
      await this.storage.remove([path]);
      if (pgCode(erro) === "23503") throw naoEncontrado("Produto");
      throw erro;
    }
    return this.product(companyId, productId);
  }

  async removeImage(companyId: string, productId: string, imageId: string): Promise<Product> {
    const apagadas = await this.conn
      .delete(productImages)
      .where(
        and(
          eq(productImages.companyId, companyId),
          eq(productImages.productId, productId),
          eq(productImages.id, imageId),
        ),
      )
      .returning({ path: productImages.path });
    if (!apagadas.length) throw naoEncontrado("Foto");
    await this.storage.remove(apagadas.map((a) => a.path));
    return this.product(companyId, productId);
  }

  // ---------- apoio ----------

  private async exigirCategoria(tx: Transaction, companyId: string, categoryId: string) {
    const [cat] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.companyId, companyId), eq(categories.id, categoryId)));
    if (!cat) {
      throw new BadRequestException({
        statusCode: 400,
        message: "Dados inválidos",
        issues: [{ path: "categoryId", message: "Categoria não encontrada" }],
      });
    }
  }

  private async proximaPosicao(tx: Transaction, companyId: string, categoryId: string) {
    const [{ ultima } = { ultima: null }] = await tx
      .select({ ultima: max(products.position) })
      .from(products)
      .where(and(eq(products.companyId, companyId), eq(products.categoryId, categoryId)));
    return (ultima ?? -1) + 1;
  }

  private async gravarAdicionais(tx: Transaction, companyId: string, productId: string, addons: ProductData["addons"]) {
    if (!addons.length) return;
    await tx.insert(productAddons).values(
      addons.map((a, position) => ({
        companyId,
        productId,
        name: a.name,
        priceCents: a.priceCents,
        active: a.active,
        position,
      })),
    );
  }

  private async gravarReceita(
    tx: Transaction,
    companyId: string,
    productId: string,
    receita: NonNullable<ProductData["recipe"]>,
  ) {
    if (!receita.length) return;
    const ids = receita.map((r) => r.ingredientId);
    const meus = await tx
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(and(eq(ingredients.companyId, companyId), inArray(ingredients.id, ids)));
    if (meus.length !== new Set(ids).size) {
      throw new BadRequestException({
        statusCode: 400,
        message: "Dados inválidos",
        issues: [{ path: "recipe", message: "Ingrediente não encontrado. Recarregue a página." }],
      });
    }
    await tx.insert(productIngredients).values(
      receita.map((r, position) => ({
        companyId,
        productId,
        ingredientId: r.ingredientId,
        quantityMilli: r.quantityMilli,
        removable: r.removable,
        position,
      })),
    );
  }

  /** A nova ordem precisa trazer exatamente os mesmos itens, sem faltar nem sobrar. */
  private mesmaLista(atuais: string[], enviados: string[]) {
    const unicos = new Set(enviados);
    const ok =
      unicos.size === enviados.length && unicos.size === atuais.length && atuais.every((id) => unicos.has(id));
    if (!ok) {
      throw new BadRequestException({
        statusCode: 400,
        message: "A lista mudou enquanto você ordenava. Recarregue a página e tente de novo.",
      });
    }
  }

  private nomeRepetido(erro: unknown) {
    if (pgCode(erro) === "23505") {
      return new ConflictException({ statusCode: 409, message: "Já existe uma categoria com esse nome." });
    }
    return erro;
  }
}
