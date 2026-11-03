import { formatMoney } from "@mesaflow/shared";
import { adicionaisDa, mudarQuantidade, precoUnitario, totalLinha, type LinhaCarrinho } from "./carrinho";
import { Quantidade } from "./Quantidade";

/** Itens do pedido sendo montado, com quantidade editável. Usado no balcão e na rodada da mesa. */
export function LinhasPedido({
  linhas,
  aoMudar,
  vazio,
}: {
  linhas: LinhaCarrinho[];
  aoMudar: (f: (l: LinhaCarrinho[]) => LinhaCarrinho[]) => void;
  vazio: string;
}) {
  if (linhas.length === 0) return <p className="suave balcao-vazio">{vazio}</p>;
  return (
    <ul className="linhas">
      {linhas.map((l) => (
        <li key={l.chave}>
          <div className="linha-topo">
            <strong>{l.produto.name}</strong>
            <span className="num">{formatMoney(totalLinha(l))}</span>
          </div>
          {(l.addonIds.length > 0 || l.removidos.length > 0 || l.obs) && (
            <ul className="linha-extras suave">
              {adicionaisDa(l).map((a) => (
                <li key={a.id}>+ {a.name}</li>
              ))}
              {l.removidos.map((id) => (
                <li key={id}>Sem {l.produto.removable.find((r) => r.ingredientId === id)?.name.toLowerCase()}</li>
              ))}
              {l.obs && <li>“{l.obs}”</li>}
            </ul>
          )}
          <div className="linha-base">
            <Quantidade valor={l.quantidade} nome={l.produto.name} aoMudar={(q) => aoMudar((ls) => mudarQuantidade(ls, l.chave, q))} />
            <span className="suave num">{formatMoney(precoUnitario(l))} cada</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
