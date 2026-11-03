import { useEffect, useMemo, useState } from "react";
import { formatMoney, type SellableMenu, type SellableProduct } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Campo, Etiqueta } from "@/ui/componentes";
import { apiPedidos } from "./api";
import { temEscolhas, type NovaLinha } from "./carrinho";
import { EscolherItem } from "./EscolherItem";

function Preco({ p }: { p: SellableProduct }) {
  if (p.promoPriceCents === null) return <span className="num">{formatMoney(p.priceCents)}</span>;
  return (
    <span className="num">
      <s className="suave">{formatMoney(p.priceCents)}</s> <strong>{formatMoney(p.promoPriceCents)}</strong>
    </span>
  );
}

/**
 * Cardápio de venda em blocos, com busca e categorias. Usado no balcão e no lançamento de rodada da mesa.
 * `recarregar` muda quando quem usa quer reler o cardápio (ex.: produto saiu de venda).
 */
export function CardapioVenda({ aoEscolher, recarregar = 0 }: { aoEscolher: (linha: NovaLinha) => void; recarregar?: number }) {
  const [menu, setMenu] = useState<SellableMenu | null>(null);
  const [erroMenu, setErroMenu] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [escolhendo, setEscolhendo] = useState<SellableProduct | null>(null);

  const carregar = () => {
    setErroMenu(null);
    apiPedidos.cardapio().then(setMenu, (e: unknown) =>
      setErroMenu(e instanceof ApiErro ? e.message : "Não foi possível carregar o cardápio."),
    );
  };
  useEffect(carregar, [recarregar]);

  function escolher(nova: NovaLinha) {
    aoEscolher(nova);
    setEscolhendo(null);
  }

  function clicarProduto(p: SellableProduct) {
    if (temEscolhas(p)) setEscolhendo(p);
    else escolher({ produto: p, quantidade: 1, addonIds: [], removidos: [], obs: "" });
  }

  const visiveis = useMemo(() => {
    if (!menu) return [];
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return menu.categories
      .filter((c) => !categoria || c.id === categoria || termo)
      .map((c) => ({ ...c, products: c.products.filter((p) => !termo || p.name.toLocaleLowerCase("pt-BR").includes(termo)) }))
      .filter((c) => c.products.length > 0);
  }, [menu, busca, categoria]);

  return (
    <>
      {erroMenu && (
        <Aviso>
          {erroMenu}{" "}
          <button type="button" className="link-btn" onClick={carregar}>
            Tentar de novo
          </button>
        </Aviso>
      )}
      {!menu && !erroMenu && <p className="suave">Carregando o cardápio...</p>}
      {menu && menu.categories.length === 0 && (
        <p className="suave">Nenhum produto à venda. Cadastre ou ative produtos no Cardápio.</p>
      )}
      {menu && menu.categories.length > 0 && (
        <>
          <div className="balcao-filtros">
            <Campo
              rotulo="Buscar produto"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome do produto"
            />
            <div className="filtros" role="group" aria-label="Categoria">
              <button type="button" aria-pressed={categoria === null} onClick={() => setCategoria(null)}>
                Tudo
              </button>
              {menu.categories.map((c) => (
                <button key={c.id} type="button" aria-pressed={categoria === c.id} onClick={() => setCategoria(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          {visiveis.length === 0 && <p className="suave">Nenhum produto com “{busca}”.</p>}
          {visiveis.map((c) => (
            <div key={c.id} className="balcao-cat">
              <h2>{c.name}</h2>
              <ul className="tiles">
                {c.products.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="tile"
                      disabled={p.soldOut}
                      aria-label={p.soldOut ? `${p.name}, esgotado` : undefined}
                      onClick={() => clicarProduto(p)}
                    >
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="tile-sem-foto" aria-hidden="true">
                          {p.name.charAt(0)}
                        </span>
                      )}
                      <span className="tile-nome">{p.name}</span>
                      {p.soldOut ? (
                        <span className="tile-dica">
                          <Etiqueta tom="neutra" icone="relogio">
                            Esgotado
                          </Etiqueta>
                        </span>
                      ) : (
                        <Preco p={p} />
                      )}
                      {!p.soldOut && temEscolhas(p) && <span className="tile-dica suave">Com opções</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
      {escolhendo && <EscolherItem produto={escolhendo} aoFechar={() => setEscolhendo(null)} aoAdicionar={escolher} />}
    </>
  );
}
