import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { catalogSchema, MAX_IMAGE_BYTES, productSchema, type Product } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { TokenVerifier } from "../../auth/token-verifier.js";
import { configureApp } from "../../configure-app.js";
import { DB } from "../../db/database.module.js";
import { StorageClient } from "../../storage/storage.client.js";
import { criarBancoDeTeste, criarPessoa, criarRestaurante, type BancoDeTeste } from "../../testing/banco.js";
import { criarEmissorDeTokens } from "../../testing/tokens.js";

// Storage em memória: guarda o que foi enviado e apagado.
class StorageFalso extends StorageClient {
  enviados = new Map<string, string>();
  apagados: string[] = [];
  falharEnvio = false;
  override publicUrl(path: string) {
    return `https://fotos.teste/${path}`;
  }
  override async upload(path: string, _: Buffer, contentType: string) {
    if (this.falharEnvio) throw new Error("storage fora do ar");
    this.enviados.set(path, contentType);
  }
  override async remove(paths: string[]) {
    this.apagados.push(...paths);
  }
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe("cardápio", () => {
  let app: INestApplication;
  let banco: BancoDeTeste;
  let emitir: (sub: string) => Promise<string>;
  const storage = new StorageFalso();

  // Restaurante A (dono e funcionário sem permissão) e restaurante B (dono).
  let donoA: string;
  let funcionarioA: string;
  let donoB: string;

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => http().post(url).set("Authorization", `Bearer ${token}`),
    patch: (url: string) => http().patch(url).set("Authorization", `Bearer ${token}`),
    put: (url: string) => http().put(url).set("Authorization", `Bearer ${token}`),
    delete: (url: string) => http().delete(url).set("Authorization", `Bearer ${token}`),
  });

  async function categoria(token: string, name: string) {
    const res = await como(token).post("/api/catalog/categories").send({ name }).expect(201);
    return res.body.id as string;
  }

  async function produto(token: string, categoryId: string, extra: Record<string, unknown> = {}): Promise<Product> {
    const res = await como(token)
      .post("/api/catalog/products")
      .send({ categoryId, name: "Lasanha", priceCents: 4290, ...extra })
      .expect(201);
    return productSchema.parse(res.body);
  }

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    const emissor = await criarEmissorDeTokens();
    emitir = emissor.token;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DB)
      .useValue(banco.db)
      .overrideProvider(TokenVerifier)
      .useValue(emissor.verifier)
      .overrideProvider(StorageClient)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await banco.fechar();
  });

  beforeEach(async () => {
    await banco.limpar();
    storage.enviados.clear();
    storage.apagados = [];
    storage.falharEnvio = false;
    const a = await criarRestaurante(banco);
    const funcionario = await criarPessoa(banco, a.companyId, { permissions: ["orders.create"] });
    const b = await criarRestaurante(banco);
    donoA = await emitir(a.authUserId);
    funcionarioA = await emitir(funcionario.authUserId);
    donoB = await emitir(b.authUserId);
  });

  describe("categorias e produtos", () => {
    it("monta o cardápio com categorias, produtos e adicionais na ordem", async () => {
      const massas = await categoria(donoA, "Massas");
      const bebidas = await categoria(donoA, "Bebidas");
      await produto(donoA, massas, {
        name: "Lasanha",
        description: "Bolonhesa",
        addons: [
          { name: "Queijo extra", priceCents: 500 },
          { name: "Bacon", priceCents: 700 },
        ],
      });
      await produto(donoA, massas, { name: "Nhoque", priceCents: 3490 });
      await produto(donoA, bebidas, { name: "Guaraná", priceCents: 650 });

      const res = await como(donoA).get("/api/catalog").expect(200);
      const cat = catalogSchema.parse(res.body);
      expect(cat.categories.map((c) => c.name)).toEqual(["Massas", "Bebidas"]);
      expect(cat.categories[0]!.products.map((p) => p.name)).toEqual(["Lasanha", "Nhoque"]);
      expect(cat.categories[0]!.products[0]!.addons.map((a) => a.name)).toEqual(["Queijo extra", "Bacon"]);
    });

    it("editar produto troca os adicionais e pode mudar de categoria", async () => {
      const massas = await categoria(donoA, "Massas");
      const pratos = await categoria(donoA, "Pratos");
      const p = await produto(donoA, massas, { addons: [{ name: "Queijo", priceCents: 500 }] });

      const res = await como(donoA)
        .patch(`/api/catalog/products/${p.id}`)
        .send({ categoryId: pratos, name: "Lasanha grande", priceCents: 5290, addons: [{ name: "Bacon", priceCents: 700 }] })
        .expect(200);
      const editado = productSchema.parse(res.body);
      expect(editado).toMatchObject({ categoryId: pratos, name: "Lasanha grande", priceCents: 5290 });
      expect(editado.addons.map((a) => a.name)).toEqual(["Bacon"]);
    });

    it("não aceita nome de categoria repetido, sem diferenciar maiúsculas", async () => {
      await categoria(donoA, "Massas");
      const res = await como(donoA).post("/api/catalog/categories").send({ name: "massas" }).expect(409);
      expect(res.body.message).toBe("Já existe uma categoria com esse nome.");
      // o mesmo nome em outro restaurante pode
      await categoria(donoB, "Massas");
    });

    it("não apaga categoria com produtos", async () => {
      const massas = await categoria(donoA, "Massas");
      await produto(donoA, massas);
      const res = await como(donoA).delete(`/api/catalog/categories/${massas}`).expect(409);
      expect(res.body.message).toContain("1 produto");
    });

    it("apaga categoria vazia e produto", async () => {
      const massas = await categoria(donoA, "Massas");
      const p = await produto(donoA, massas);
      await como(donoA).delete(`/api/catalog/products/${p.id}`).expect(204);
      await como(donoA).delete(`/api/catalog/categories/${massas}`).expect(204);
      const res = await como(donoA).get("/api/catalog").expect(200);
      expect(res.body.categories).toEqual([]);
    });

    it("valida o corpo com as mensagens do shared", async () => {
      const massas = await categoria(donoA, "Massas");
      const res = await como(donoA)
        .post("/api/catalog/products")
        .send({ categoryId: massas, name: " ", priceCents: -1 })
        .expect(400);
      const caminhos = res.body.issues.map((i: { path: string }) => i.path);
      expect(caminhos).toEqual(expect.arrayContaining(["name", "priceCents"]));
    });

    it("reordena categorias e produtos", async () => {
      const a = await categoria(donoA, "A");
      const b = await categoria(donoA, "B");
      const p1 = await produto(donoA, a, { name: "Um" });
      const p2 = await produto(donoA, a, { name: "Dois" });
      await como(donoA).put("/api/catalog/categories/order").send({ ids: [b, a] }).expect(204);
      await como(donoA).put(`/api/catalog/categories/${a}/products/order`).send({ ids: [p2.id, p1.id] }).expect(204);
      const cat = catalogSchema.parse((await como(donoA).get("/api/catalog")).body);
      expect(cat.categories.map((c) => c.name)).toEqual(["B", "A"]);
      expect(cat.categories[1]!.products.map((p) => p.name)).toEqual(["Dois", "Um"]);
    });

    it("recusa ordem que não traz exatamente os mesmos itens", async () => {
      const a = await categoria(donoA, "A");
      await categoria(donoA, "B");
      await como(donoA).put("/api/catalog/categories/order").send({ ids: [a] }).expect(400);
      await como(donoA).put("/api/catalog/categories/order").send({ ids: [a, a] }).expect(400);
    });
  });

  describe("permissões e isolamento entre restaurantes", () => {
    it("qualquer pessoa da equipe lê o cardápio, mas só quem tem catalog.manage altera", async () => {
      const massas = await categoria(donoA, "Massas");
      await como(funcionarioA).get("/api/catalog").expect(200);
      const res = await como(funcionarioA).post("/api/catalog/categories").send({ name: "Outra" }).expect(403);
      expect(res.body.message).toBe("Você não tem permissão para esta ação.");
      await como(funcionarioA).post("/api/catalog/products").send({ categoryId: massas, name: "X", priceCents: 1 }).expect(403);
      await como(funcionarioA).delete(`/api/catalog/categories/${massas}`).expect(403);
    });

    it("sem login responde 401", async () => {
      await http().get("/api/catalog").expect(401);
    });

    it("restaurante B não vê nem altera nada do restaurante A", async () => {
      const massas = await categoria(donoA, "Massas");
      const p = await produto(donoA, massas);
      const foto = await como(donoA).post(`/api/catalog/products/${p.id}/images`).attach("foto", JPEG, "a.jpg").expect(201);
      const fotoId = foto.body.images[0].id as string;

      const leitura = await como(donoB).get("/api/catalog").expect(200);
      expect(leitura.body.categories).toEqual([]);

      await como(donoB).patch(`/api/catalog/categories/${massas}`).send({ name: "Roubada" }).expect(404);
      await como(donoB).delete(`/api/catalog/categories/${massas}`).expect(404);
      await como(donoB).patch(`/api/catalog/products/${p.id}`).send({ categoryId: massas, name: "X", priceCents: 1 }).expect(404);
      await como(donoB).delete(`/api/catalog/products/${p.id}`).expect(404);
      await como(donoB).post(`/api/catalog/products/${p.id}/images`).attach("foto", JPEG, "b.jpg").expect(404);
      await como(donoB).delete(`/api/catalog/products/${p.id}/images/${fotoId}`).expect(404);
      await como(donoB).put("/api/catalog/categories/order").send({ ids: [massas] }).expect(400);
      await como(donoB).put(`/api/catalog/categories/${massas}/products/order`).send({ ids: [p.id] }).expect(400);

      // nada mudou no restaurante A
      const cat = catalogSchema.parse((await como(donoA).get("/api/catalog")).body);
      expect(cat.categories[0]).toMatchObject({ name: "Massas" });
      expect(cat.categories[0]!.products[0]!.images).toHaveLength(1);
    });

    it("produto não pode usar a categoria de outro restaurante", async () => {
      const deA = await categoria(donoA, "Massas");
      const res = await como(donoB)
        .post("/api/catalog/products")
        .send({ categoryId: deA, name: "Invasor", priceCents: 100 })
        .expect(400);
      expect(res.body.issues).toEqual([{ path: "categoryId", message: "Categoria não encontrada" }]);

      const deB = await categoria(donoB, "Pratos");
      const p = await produto(donoB, deB);
      await como(donoB)
        .patch(`/api/catalog/products/${p.id}`)
        .send({ categoryId: deA, name: "Invasor", priceCents: 100 })
        .expect(400);
    });

    it("id inválido na URL responde 400", async () => {
      await como(donoA).delete("/api/catalog/products/nao-e-uuid").expect(400);
    });
  });

  describe("fotos", () => {
    it("guarda a foto pelo tipo real do arquivo e devolve a URL", async () => {
      const p = await produto(donoA, await categoria(donoA, "Massas"));
      const res = await como(donoA).post(`/api/catalog/products/${p.id}/images`).attach("foto", PNG, "foto.jpg").expect(201);
      const comFoto = productSchema.parse(res.body);
      expect(comFoto.images).toHaveLength(1);
      const [caminho, tipo] = [...storage.enviados][0]!;
      expect(tipo).toBe("image/png");
      expect(caminho).toMatch(/\.png$/);
      expect(comFoto.images[0]!.url).toBe(`https://fotos.teste/${caminho}`);
    });

    it("recusa SVG e arquivo que não é imagem", async () => {
      const p = await produto(donoA, await categoria(donoA, "Massas"));
      const res = await como(donoA).post(`/api/catalog/products/${p.id}/images`).attach("foto", SVG, "a.svg").expect(400);
      expect(res.body.message).toBe("Use uma foto em JPG, PNG ou WEBP.");
      await como(donoA).post(`/api/catalog/products/${p.id}/images`).expect(400);
    });

    it("recusa foto acima do limite", async () => {
      const p = await produto(donoA, await categoria(donoA, "Massas"));
      const grande = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES)]);
      const res = await como(donoA).post(`/api/catalog/products/${p.id}/images`).attach("foto", grande, "g.jpg").expect(413);
      expect(res.body.message).toContain("3 MB");
      expect(storage.enviados.size).toBe(0);
    });

    it("aceita no máximo 4 fotos por produto", async () => {
      const p = await produto(donoA, await categoria(donoA, "Massas"));
      for (let i = 0; i < 4; i++) {
        await como(donoA).post(`/api/catalog/products/${p.id}/images`).attach("foto", JPEG, "a.jpg").expect(201);
      }
      await como(donoA).post(`/api/catalog/products/${p.id}/images`).attach("foto", JPEG, "a.jpg").expect(409);
    });

    it("apagar a foto ou o produto apaga o arquivo do storage", async () => {
      const p = await produto(donoA, await categoria(donoA, "Massas"));
      const r1 = await como(donoA).post(`/api/catalog/products/${p.id}/images`).attach("foto", JPEG, "a.jpg").expect(201);
      await como(donoA).post(`/api/catalog/products/${p.id}/images`).attach("foto", JPEG, "b.jpg").expect(201);
      const [primeiro, segundo] = [...storage.enviados.keys()];

      const sem = await como(donoA).delete(`/api/catalog/products/${p.id}/images/${r1.body.images[0].id}`).expect(200);
      expect(sem.body.images).toHaveLength(1);
      expect(storage.apagados).toEqual([primeiro]);

      await como(donoA).delete(`/api/catalog/products/${p.id}`).expect(204);
      expect(storage.apagados).toEqual([primeiro, segundo]);
    });

    it("se o storage falhar, nada é gravado no banco", async () => {
      const p = await produto(donoA, await categoria(donoA, "Massas"));
      storage.falharEnvio = true;
      await como(donoA).post(`/api/catalog/products/${p.id}/images`).attach("foto", JPEG, "a.jpg").expect(500);
      const cat = catalogSchema.parse((await como(donoA).get("/api/catalog")).body);
      expect(cat.categories[0]!.products[0]!.images).toEqual([]);
    });
  });
});
