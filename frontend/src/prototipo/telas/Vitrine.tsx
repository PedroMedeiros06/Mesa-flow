import { useState } from "react";
import { Icone } from "../Icone";
import { cardapio, reais, restaurante } from "../dados";

export function Vitrine() {
  const [categoria, setCategoria] = useState(cardapio[0]!.categoria);

  return (
    <div className="vit-palco">
      <aside>
        <h2>Vitrine do restaurante</h2>
        <p className="suave">
          O link que o restaurante manda no WhatsApp. Pensada primeiro para o celular: categorias fixas no topo,
          botão de adicionar ao alcance do polegar e a sacola sempre visível.
        </p>
      </aside>

      <div className="vit-celular">
        <div className="vit">
          <header className="vit-topo">
            <h1>{restaurante.nome}</h1>
            <p>Aberto até 23h</p>
            <div className="vit-retirada">
              <span className="etiqueta">
                <Icone nome="relogio" tamanho={16} />
                Retirada em cerca de 25 min
              </span>
            </div>
          </header>

          <div className="vit-cats" role="toolbar" aria-label="Categorias">
            {cardapio.map((c) => (
              <button
                key={c.categoria}
                type="button"
                aria-pressed={c.categoria === categoria}
                onClick={() => setCategoria(c.categoria)}
              >
                {c.categoria}
              </button>
            ))}
          </div>

          {cardapio.map((c) => (
            <section className="vit-secao" key={c.categoria}>
              <h2>{c.categoria}</h2>
              {c.produtos.map((p) => (
                <article className="vit-prod" key={p.nome}>
                  <h3>{p.nome}</h3>
                  <p>{p.descricao}</p>
                  <span className="vit-preco num">
                    {reais(p.precoCentavos)}
                    {p.precoAntigoCentavos && <s>{reais(p.precoAntigoCentavos)}</s>}
                  </span>
                  <button className="vit-add" type="button" aria-label={`Adicionar ${p.nome}`}>
                    <Icone nome="mais" />
                  </button>
                </article>
              ))}
            </section>
          ))}
        </div>

        <button className="vit-sacola" type="button">
          <span className="qtd num">2</span>
          Ver sacola
          <span className="total num">{reais(7780)}</span>
        </button>
      </div>

      <aside>
        <h2>Depois do pedido</h2>
        <p className="suave">
          O cliente recebe uma página para acompanhar: recebido, em preparo e pronto para retirar, com as mesmas
          cores da cozinha.
        </p>
      </aside>
    </div>
  );
}
