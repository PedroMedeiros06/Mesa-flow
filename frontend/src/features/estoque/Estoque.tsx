import { useCallback, useEffect, useRef, useState } from "react";
import { formatQuantity, stockStatus, type Ingredient } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Comanda, CorteComanda, Etiqueta } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { apiEstoque } from "./api";
import { EditorIngrediente } from "./EditorIngrediente";
import { Movimentar } from "./Movimentar";
import "./estoque.css";

type Filtro = "todos" | "alerta";
type Editor = { tipo: "editar"; ingrediente: Ingredient | null } | { tipo: "movimentar"; ingrediente: Ingredient } | null;

function Situacao({ ingrediente }: { ingrediente: Ingredient }) {
  const s = stockStatus(ingrediente);
  if (s === "zerado") {
    return (
      <Etiqueta tom="brasa" icone="alerta">
        {ingrediente.stockMilli < 0 ? "Negativo" : "Zerado"}
      </Etiqueta>
    );
  }
  if (s === "baixo") {
    return (
      <Etiqueta tom="ambar" icone="relogio">
        Acabando
      </Etiqueta>
    );
  }
  return null;
}

export function Estoque() {
  const [lista, setLista] = useState<Ingredient[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editor, setEditor] = useState<Editor>(null);
  const [recado, setRecado] = useState("");
  const timer = useRef<number>(undefined);

  const carregar = useCallback(async () => {
    try {
      setLista(await apiEstoque.listar());
      setErro(null);
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível carregar o estoque.");
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

  const emAlerta = (lista ?? []).filter((i) => stockStatus(i) !== "ok");
  const visiveis = filtro === "alerta" ? emAlerta : (lista ?? []);

  return (
    <>
      <div className="cab">
        <div>
          <h1>Estoque</h1>
          {lista && (
            <p className="suave" style={{ marginTop: 6 }}>
              {lista.length} {lista.length === 1 ? "ingrediente" : "ingredientes"}
              {emAlerta.length > 0 && `, ${emAlerta.length} precisando de atenção`}
            </p>
          )}
        </div>
        <div className="direita">
          <Botao icone="mais" onClick={() => setEditor({ tipo: "editar", ingrediente: null })}>
            Novo ingrediente
          </Botao>
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

      {!lista && !erro && <p className="suave">Carregando o estoque...</p>}

      {lista && lista.length === 0 && (
        <div className="vazio">
          <Comanda>
            <h2 style={{ fontSize: "var(--t-2xl)" }}>Nenhum ingrediente ainda</h2>
            <CorteComanda />
            <p>
              Cadastre o que você compra (queijo, farinha, refrigerante) e monte a ficha técnica de cada produto no
              Cardápio. A cada venda o estoque baixa sozinho.
            </p>
            <div style={{ marginTop: 16 }}>
              <Botao icone="mais" onClick={() => setEditor({ tipo: "editar", ingrediente: null })}>
                Cadastrar o primeiro ingrediente
              </Botao>
            </div>
          </Comanda>
        </div>
      )}

      {lista && lista.length > 0 && (
        <>
          <div className="filtros" role="group" aria-label="Filtrar ingredientes">
            <button type="button" aria-pressed={filtro === "todos"} onClick={() => setFiltro("todos")}>
              Todos
            </button>
            <button type="button" aria-pressed={filtro === "alerta"} onClick={() => setFiltro("alerta")}>
              Precisam de atenção <span className="num">{emAlerta.length}</span>
            </button>
          </div>

          {visiveis.length === 0 ? (
            <p className="suave">Tudo em dia: nenhum ingrediente zerado ou acabando.</p>
          ) : (
            <ul className="ingredientes">
              {visiveis.map((i) => (
                <li key={i.id}>
                  <div className="ing-nome">
                    <strong>{i.name}</strong>
                    <span className="suave">
                      {i.usedIn > 0
                        ? `Em ${i.usedIn} ${i.usedIn === 1 ? "produto" : "produtos"}`
                        : "Fora das fichas técnicas"}
                      {i.minStockMilli !== null && `. Aviso em ${formatQuantity(i.minStockMilli, i.unit)}`}
                    </span>
                  </div>
                  <span className="ing-status">
                    <Situacao ingrediente={i} />
                  </span>
                  <span className={`ing-saldo num ${i.stockMilli < 0 ? "negativo" : ""}`}>
                    {formatQuantity(i.stockMilli, i.unit)}
                  </span>
                  <div className="ing-acoes">
                    <Botao pequeno variante="claro" onClick={() => setEditor({ tipo: "movimentar", ingrediente: i })}>
                      Movimentar
                    </Botao>
                    <button
                      type="button"
                      className="icone-btn"
                      aria-label={`Editar ${i.name}`}
                      onClick={() => setEditor({ tipo: "editar", ingrediente: i })}
                    >
                      <Icone nome="lapis" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {editor?.tipo === "editar" && (
        <EditorIngrediente
          ingrediente={editor.ingrediente}
          aoFechar={() => setEditor(null)}
          aoSalvar={(m) => {
            setEditor(null);
            avisar(m);
            void carregar();
          }}
        />
      )}
      {editor?.tipo === "movimentar" && (
        <Movimentar
          ingrediente={editor.ingrediente}
          aoFechar={() => setEditor(null)}
          aoSalvar={(novo, m) => {
            avisar(m);
            setLista((l) => l?.map((x) => (x.id === novo.id ? novo : x)) ?? l);
          }}
        />
      )}
    </>
  );
}
