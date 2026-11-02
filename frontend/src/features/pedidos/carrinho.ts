import { MAX_ITEM_QUANTITY, unitPrice, type OrderItemInput, type SellableProduct } from "@mesaflow/shared";

/** Uma linha do pedido que está sendo montado no balcão. */
export interface LinhaCarrinho {
  chave: string;
  produto: SellableProduct;
  quantidade: number;
  addonIds: string[];
  removidos: string[];
  obs: string;
}

export type NovaLinha = Omit<LinhaCarrinho, "chave">;

/** Duas linhas com o mesmo produto e as mesmas escolhas viram uma só, somando a quantidade. */
function assinatura(l: NovaLinha) {
  return JSON.stringify([l.produto.id, [...l.addonIds].sort(), [...l.removidos].sort(), l.obs.trim()]);
}

export function adicionar(lista: LinhaCarrinho[], nova: NovaLinha, chave: string): LinhaCarrinho[] {
  const igual = lista.find((l) => assinatura(l) === assinatura(nova));
  if (!igual) return [...lista, { ...nova, obs: nova.obs.trim(), chave }];
  return lista.map((l) =>
    l === igual ? { ...l, quantidade: Math.min(l.quantidade + nova.quantidade, MAX_ITEM_QUANTITY) } : l,
  );
}

/** Muda a quantidade; zero tira a linha. */
export function mudarQuantidade(lista: LinhaCarrinho[], chave: string, quantidade: number): LinhaCarrinho[] {
  if (quantidade <= 0) return lista.filter((l) => l.chave !== chave);
  return lista.map((l) => (l.chave === chave ? { ...l, quantidade: Math.min(quantidade, MAX_ITEM_QUANTITY) } : l));
}

export function adicionaisDa(l: Pick<LinhaCarrinho, "produto" | "addonIds">) {
  return l.produto.addons.filter((a) => l.addonIds.includes(a.id));
}

export function precoUnitario(l: Pick<LinhaCarrinho, "produto" | "addonIds">) {
  return unitPrice(l.produto, adicionaisDa(l));
}

export function totalLinha(l: LinhaCarrinho) {
  return precoUnitario(l) * l.quantidade;
}

export function paraPedido(lista: LinhaCarrinho[]): OrderItemInput[] {
  return lista.map((l) => ({
    productId: l.produto.id,
    quantity: l.quantidade,
    addonIds: l.addonIds,
    removedIngredientIds: l.removidos,
    notes: l.obs,
  }));
}

/** Produto sem escolhas vai direto para o pedido; com adicionais ou ingredientes opcionais abre o diálogo. */
export function temEscolhas(p: SellableProduct) {
  return p.addons.length > 0 || p.removable.length > 0;
}
