import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney, type Catalog, type Category, type Product } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Comanda, CorteComanda, Etiqueta } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { apiCardapio, mover } from "./api";
import { EditorCategoria } from "./EditorCategoria";
import { EditorProduto } from "./EditorProduto";
import "./cardapio.css";

type Editor =
  | { tipo: "categoria"; categoria: Category | null }
  | { tipo: "produto"; produto: Product | null; categoriaId?: string }
  | null;

export function Cardapio() {
  const [cardapio, setCardapio] = useState<Catalog | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [recado, setRecado] = useState("");
  const timer = useRef<number>(undefined);

  const carregar = useCallback(async () => {
    try {
      setCardapio(await apiCardapio.carregar());
      setErro(null);
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível carregar o cardápio.");
    }
  }, []);

  useEffect(() => {
    void carregar();
    return () => window.clearTimeout(timer.current);
  }, [carregar]);

  const avisar = (texto: string) => {
    setRecado(texto);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRecado(""), 4000);
  };

  const aoSalvar = (mensagem: string) => {
    setEditor(null);
    avisar(mensagem);
    void carregar();
  };

  // Troca a ordem na tela na hora e confirma no servidor; se falhar, recarrega.
  async function ordenar(acao: () => Promise<void>, otimista: Catalog) {
    setCardapio(otimista);
    try {
      await acao();
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível mudar a ordem.");
      void carregar();
    }
  }

  function moverCategoria(indice: number, direcao: -1 | 1) {
    if (!cardapio) return;
    const nova = mover(cardapio.categories, indice, direcao);
    if (!nova) return;
    void ordenar(() => apiCardapio.ordenarCategorias(nova.map((c) => c.id)), { categories: nova });
  }

  function moverProduto(categoria: Category, indice: number, direcao: -1 | 1) {
    if (!cardapio) return;
    const nova = mover(categoria.products, indice, direcao);
    if (!nova) return;
    void ordenar(() => apiCardapio.ordenarProdutos(categoria.id, nova.map((p) => p.id)), {
      categories: cardapio.categories.map((c) => (c.id === categoria.id ? { ...c, products: nova } : c)),
    });
  }

  const categorias = cardapio?.categories ?? [];
  const totalProdutos = categorias.reduce((n, c) => n + c.products.length, 0);

  return (
    <>
      <div className="cab">
        <div>
          <h1>Cardápio</h1>
          {cardapio && (
            <p className="suave" style={{ marginTop: 6 }}>
              {categorias.length} {categorias.length === 1 ? "categoria" : "categorias"}, {totalProdutos}{" "}
              {totalProdutos === 1 ? "produto" : "produtos"}
            </p>
          )}
        </div>
        <div className="direita">
          <Botao variante="claro" icone="mais" onClick={() => setEditor({ tipo: "categoria", categoria: null })}>
            Nova categoria
          </Botao>
          {categorias.length > 0 && (
            <Botao icone="mais" onClick={() => setEditor({ tipo: "produto", produto: null })}>
              Novo produto
            </Botao>
          )}
        </div>
      </div>

      <div className="recado" role="status" aria-live="polite">
        {recado && (
          <Etiqueta tom="feito" icone="check">
            {recado}
          </Etiqueta>
        )}
      </div>

      {erro && (
        <div style={{ marginBottom: 20, maxWidth: 640 }}>
          <Aviso>
            {erro}{" "}
            <button type="button" className="link-btn" onClick={() => void carregar()}>
              Tentar de novo
            </button>
          </Aviso>
        </div>
      )}

      {!cardapio && !erro && <p className="suave">Carregando o cardápio...</p>}

      {cardapio && categorias.length === 0 && (
        <div className="vazio">
          <Comanda>
            <h2 style={{ fontSize: "var(--t-2xl)" }}>Seu cardápio está vazio</h2>
            <CorteComanda />
            <p>
              Comece pelas categorias, como Massas, Pratos e Bebidas. Depois cadastre os produtos de cada uma, com preço,
              adicionais e fotos.
            </p>
            <div style={{ marginTop: 16 }}>
              <Botao icone="mais" onClick={() => setEditor({ tipo: "categoria", categoria: null })}>
                Criar a primeira categoria
              </Botao>
            </div>
          </Comanda>
        </div>
      )}

      <div className="cardapio">
        {categorias.map((cat, ci) => (
          <section key={cat.id} className="cat" aria-labelledby={`cat-${cat.id}`}>
            <header className="cat-cab">
              <h2 id={`cat-${cat.id}`}>{cat.name}</h2>
              <span className="suave num">{cat.products.length}</span>
              {!cat.active && (
                <Etiqueta tom="neutra" icone="cadeado">
                  Escondida
                </Etiqueta>
              )}
              <div className="cat-acoes">
                <button
                  type="button"
                  className="icone-btn"
                  aria-label={`Subir a categoria ${cat.name}`}
                  disabled={ci === 0}
                  onClick={() => moverCategoria(ci, -1)}
                >
                  <Icone nome="cima" />
                </button>
                <button
                  type="button"
                  className="icone-btn"
                  aria-label={`Descer a categoria ${cat.name}`}
                  disabled={ci === categorias.length - 1}
                  onClick={() => moverCategoria(ci, 1)}
                >
                  <Icone nome="baixo" />
                </button>
                <Botao variante="claro" pequeno icone="lapis" onClick={() => setEditor({ tipo: "categoria", categoria: cat })}>
                  Editar
                </Botao>
                <Botao
                  variante="claro"
                  pequeno
                  icone="mais"
                  onClick={() => setEditor({ tipo: "produto", produto: null, categoriaId: cat.id })}
                >
                  Produto
                </Botao>
              </div>
            </header>

            {cat.products.length === 0 ? (
              <p className="suave cat-vazia">Nenhum produto nesta categoria ainda.</p>
            ) : (
              <ul className="prods">
                {cat.products.map((p, pi) => (
                  <li key={p.id} className={p.active ? undefined : "prod-inativo"}>
                    <button
                      type="button"
                      className="prod"
                      onClick={() => setEditor({ tipo: "produto", produto: p })}
                      aria-label={`Editar ${p.name}`}
                    >
                      <span className="prod-foto">
                        {p.images[0] ? <img src={p.images[0].url} alt="" loading="lazy" /> : <Icone nome="foto" />}
                      </span>
                      <span className="prod-texto">
                        <strong>{p.name}</strong>
                        {p.description && <span className="suave">{p.description}</span>}
                        <span className="prod-meta">
                          {!p.active && (
                            <Etiqueta tom="neutra" icone="cadeado">
                              Fora de venda
                            </Etiqueta>
                          )}
                          {p.addons.length > 0 && (
                            <span className="suave">
                              {p.addons.length} {p.addons.length === 1 ? "adicional" : "adicionais"}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="prod-preco num">
                        {p.promoPriceCents !== null ? (
                          <>
                            <s className="suave">{formatMoney(p.priceCents)}</s> {formatMoney(p.promoPriceCents)}
                          </>
                        ) : (
                          formatMoney(p.priceCents)
                        )}
                      </span>
                    </button>
                    <span className="prod-ordem">
                      <button
                        type="button"
                        className="icone-btn"
                        aria-label={`Subir ${p.name}`}
                        disabled={pi === 0}
                        onClick={() => moverProduto(cat, pi, -1)}
                      >
                        <Icone nome="cima" tamanho={18} />
                      </button>
                      <button
                        type="button"
                        className="icone-btn"
                        aria-label={`Descer ${p.name}`}
                        disabled={pi === cat.products.length - 1}
                        onClick={() => moverProduto(cat, pi, 1)}
                      >
                        <Icone nome="baixo" tamanho={18} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {editor?.tipo === "categoria" && (
        <EditorCategoria categoria={editor.categoria} aoFechar={() => setEditor(null)} aoSalvar={aoSalvar} />
      )}
      {editor?.tipo === "produto" && (
        <EditorProduto
          produto={editor.produto}
          categorias={categorias}
          categoriaInicial={editor.categoriaId}
          aoFechar={() => setEditor(null)}
          aoSalvar={aoSalvar}
        />
      )}
    </>
  );
}
