import {
  catalogSchema,
  categorySchema,
  productSchema,
  type Catalog,
  type CategoryInput,
  type Product,
  type ProductInput,
} from "@mesaflow/shared";
import { sessao } from "@/lib/sessao";

const corpo = (method: string, dados: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(dados),
});

const pedir = (caminho: string, init?: RequestInit) => sessao.requisicao("membro", caminho, init);

// Cliente da API do cardápio. Toda resposta passa pelo mesmo schema que o backend usa.
export const apiCardapio = {
  async carregar(): Promise<Catalog> {
    return catalogSchema.parse(await (await pedir("/catalog")).json());
  },

  async criarCategoria(dados: CategoryInput) {
    return categorySchema.parse(await (await pedir("/catalog/categories", corpo("POST", dados))).json());
  },
  async editarCategoria(id: string, dados: CategoryInput) {
    await pedir(`/catalog/categories/${id}`, corpo("PATCH", dados));
  },
  async apagarCategoria(id: string) {
    await pedir(`/catalog/categories/${id}`, { method: "DELETE" });
  },
  async ordenarCategorias(ids: string[]) {
    await pedir("/catalog/categories/order", corpo("PUT", { ids }));
  },

  async criarProduto(dados: ProductInput): Promise<Product> {
    return productSchema.parse(await (await pedir("/catalog/products", corpo("POST", dados))).json());
  },
  async editarProduto(id: string, dados: ProductInput): Promise<Product> {
    return productSchema.parse(await (await pedir(`/catalog/products/${id}`, corpo("PATCH", dados))).json());
  },
  async apagarProduto(id: string) {
    await pedir(`/catalog/products/${id}`, { method: "DELETE" });
  },
  async ordenarProdutos(categoriaId: string, ids: string[]) {
    await pedir(`/catalog/categories/${categoriaId}/products/order`, corpo("PUT", { ids }));
  },

  async enviarFoto(produtoId: string, arquivo: File): Promise<Product> {
    const dados = new FormData();
    dados.append("foto", arquivo);
    // Sem Content-Type: o navegador monta o multipart com o separador certo.
    return productSchema.parse(await (await pedir(`/catalog/products/${produtoId}/images`, { method: "POST", body: dados })).json());
  },
  async apagarFoto(produtoId: string, fotoId: string): Promise<Product> {
    return productSchema.parse(await (await pedir(`/catalog/products/${produtoId}/images/${fotoId}`, { method: "DELETE" })).json());
  },
};

/** Troca um item de lugar com o vizinho. Devolve null se já está na ponta. */
export function mover<T>(lista: T[], indice: number, direcao: -1 | 1): T[] | null {
  const alvo = indice + direcao;
  if (alvo < 0 || alvo >= lista.length) return null;
  const nova = [...lista];
  [nova[indice], nova[alvo]] = [nova[alvo]!, nova[indice]!];
  return nova;
}
