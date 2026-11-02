import type { SellableMenu } from "@mesaflow/shared";
import type { LinhaCarrinho } from "../pedidos/carrinho";

// O carrinho e o último pedido ficam no próprio aparelho do cliente, por restaurante.
// Se o navegador não deixar guardar (aba anônima, bloqueio), a vitrine funciona igual, só não lembra.

type LinhaGuardada = { produtoId: string; quantidade: number; addonIds: string[]; removidos: string[]; obs: string };

const chaveCarrinho = (codigo: string) => `mesaflow:carrinho:${codigo}`;
const chavePedido = (codigo: string) => `mesaflow:ultimo-pedido:${codigo}`;

function ler(chave: string): unknown {
  try {
    const t = localStorage.getItem(chave);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // sem armazenamento: segue sem lembrar
  }
}

export function guardarCarrinho(codigo: string, linhas: LinhaCarrinho[]) {
  const dados: LinhaGuardada[] = linhas.map((l) => ({
    produtoId: l.produto.id,
    quantidade: l.quantidade,
    addonIds: l.addonIds,
    removidos: l.removidos,
    obs: l.obs,
  }));
  gravar(chaveCarrinho(codigo), dados.length ? dados : null);
}

/** Remonta o carrinho com o cardápio de agora: some o que saiu de venda ou esgotou. */
export function lerCarrinho(codigo: string, menu: SellableMenu): LinhaCarrinho[] {
  const dados = ler(chaveCarrinho(codigo));
  if (!Array.isArray(dados)) return [];
  const produtos = menu.categories.flatMap((c) => c.products);
  const linhas: LinhaCarrinho[] = [];
  for (const [i, d] of (dados as LinhaGuardada[]).entries()) {
    const produto = produtos.find((p) => p.id === d?.produtoId);
    if (!produto || produto.soldOut || !Number.isInteger(d.quantidade) || d.quantidade < 1) continue;
    linhas.push({
      chave: `g${i}`,
      produto,
      quantidade: d.quantidade,
      addonIds: (d.addonIds ?? []).filter((id) => produto.addons.some((a) => a.id === id)),
      removidos: (d.removidos ?? []).filter((id) => produto.removable.some((r) => r.ingredientId === id)),
      obs: typeof d.obs === "string" ? d.obs : "",
    });
  }
  return linhas;
}

export function guardarUltimoPedido(codigo: string, id: string | null) {
  gravar(chavePedido(codigo), id);
}

export function lerUltimoPedido(codigo: string): string | null {
  const id = ler(chavePedido(codigo));
  return typeof id === "string" ? id : null;
}
