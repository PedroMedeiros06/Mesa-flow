import { useState } from "react";
import { Icone, type NomeIcone } from "../Icone";
import type { IdTela } from "../Prototipo";
import {
  mesas,
  pedidos,
  reais,
  restaurante,
  resumoDia,
  type Mesa,
  type Pedido,
  type StatusMesa,
  type StatusPedido,
} from "../dados";

type TelaPainel = Extract<IdTela, "painel" | "mesas" | "cozinha">;
type Ir = (id: IdTela) => (e: React.MouseEvent) => void;

const MENU: { id: string; nome: string; icone: NomeIcone; tela?: TelaPainel; contador?: number }[] = [
  { id: "painel", nome: "Início", icone: "inicio", tela: "painel" },
  { id: "mesas", nome: "Mesas", icone: "mesa", tela: "mesas" },
  { id: "balcao", nome: "Balcão", icone: "balcao" },
  { id: "cozinha", nome: "Cozinha", icone: "cozinha", tela: "cozinha", contador: 4 },
  { id: "pedidos", nome: "Pedidos", icone: "pedidos" },
  { id: "cardapio", nome: "Cardápio", icone: "cardapio" },
  { id: "estoque", nome: "Estoque", icone: "estoque" },
  { id: "equipe", nome: "Equipe", icone: "equipe" },
  { id: "ajustes", nome: "Ajustes", icone: "ajustes" },
];

export function Painel({ tela, ir }: { tela: TelaPainel; ir: Ir }) {
  const link = (item: (typeof MENU)[number]) => ({
    href: item.tela ? `/prototipo/${item.tela}` : "#",
    onClick: item.tela ? ir(item.tela) : (e: React.MouseEvent) => e.preventDefault(),
    "aria-current": item.tela === tela ? ("page" as const) : undefined,
  });

  return (
    <div className="painel">
      <aside className="trilho">
        <a className="marca" href="/prototipo/inicio" style={{ color: "var(--trilho-texto)" }}>
          <span className="marca-selo" aria-hidden="true" />
          MesaFlow
        </a>
        <div className="trilho-rest">
          <strong>{restaurante.nome}</strong>
          <span>Código {restaurante.codigo}</span>
        </div>
        <nav aria-label="Painel">
          {MENU.map((item) => (
            <a key={item.id} {...link(item)}>
              <Icone nome={item.icone} />
              {item.nome}
              {item.contador && (
                <span className="contador num" aria-label={`${item.contador} pedidos`}>
                  {item.contador}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="trilho-pe">
          Marina Costa
          <br />
          Dona
        </div>
      </aside>

      <main className="conteudo">
        {tela === "painel" && <Inicio ir={ir} />}
        {tela === "mesas" && <Mesas />}
        {tela === "cozinha" && <Cozinha />}
      </main>

      <nav className="abas-baixo" aria-label="Painel">
        {MENU.slice(0, 4).map((item) => (
          <a key={item.id} {...link(item)}>
            <Icone nome={item.icone} />
            {item.nome}
          </a>
        ))}
        <a href="#" onClick={(e) => e.preventDefault()}>
          <Icone nome="pedidos" />
          Mais
        </a>
      </nav>
    </div>
  );
}

/* ---------- Início (resumo do dia) ---------- */

function Inicio({ ir }: { ir: Ir }) {
  const maiorHora = Math.max(...resumoDia.porHora);
  const maiorItem = resumoDia.maisVendidos[0]!.qtd;
  const atrasados = pedidos.filter((p) => p.atrasado).length;

  return (
    <>
      <div className="cab">
        <div>
          <h1>Boa noite, Marina</h1>
          <p className="suave" style={{ marginTop: 6 }}>
            Sábado, 2 de novembro
          </p>
        </div>
        <div className="direita">
          <a className="btn btn-primario" href="#" onClick={(e) => e.preventDefault()}>
            <Icone nome="mais" />
            Novo pedido no balcão
          </a>
        </div>
      </div>

      <div className="dash">
        <div>
          <div className="agora">
            <a href="/prototipo/mesas" onClick={ir("mesas")}>
              <span className="suave">Mesas abertas agora</span>
              <span className="numeral">{resumoDia.mesasAbertas}</span>
              <span>2 pediram a conta</span>
            </a>
            <a href="/prototipo/cozinha" onClick={ir("cozinha")} className={atrasados ? "alarme" : undefined}>
              <span>Pedidos na cozinha</span>
              <span className="numeral">{pedidos.filter((p) => p.status !== "pronto").length}</span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 800 }}>
                <Icone nome="alerta" tamanho={18} />
                {atrasados} atrasado há 24 min
              </span>
            </a>
          </div>

          <section className="bloco">
            <h2>Pedidos por hora</h2>
            <div className="horas" role="img" aria-label="Pedidos por hora, das 11h às 23h. Pico às 19h com 16 pedidos.">
              {resumoDia.porHora.map((n, i) => (
                <div
                  key={i}
                  style={{ height: `${(n / maiorHora) * 100}%` }}
                  data-agora={i === resumoDia.porHora.length - 1 ? "" : undefined}
                />
              ))}
            </div>
            <div className="horas-legenda">
              <span>11h</span>
              <span>17h</span>
              <span>agora</span>
            </div>
          </section>
        </div>

        <div className="dia">
          <div className="ticket">
            <dl>
              <dt>Vendas de hoje</dt>
              <dd className="numeral num">{reais(resumoDia.vendasCentavos)}</dd>
            </dl>
            <hr className="ticket-corte" />
            <div className="ticket-linha">
              <dl>
                <dt>Pedidos</dt>
                <dd className="num" style={{ fontWeight: 800, fontSize: 24 }}>
                  {resumoDia.pedidos}
                </dd>
              </dl>
              <dl style={{ textAlign: "right" }}>
                <dt>Ticket médio</dt>
                <dd className="num" style={{ fontWeight: 800, fontSize: 24 }}>
                  {reais(resumoDia.ticketCentavos)}
                </dd>
              </dl>
            </div>
            <hr className="ticket-corte" />
            <section className="bloco">
              <h2>Mais vendidos</h2>
              <ol className="top">
                {resumoDia.maisVendidos.map((item) => (
                  <li key={item.nome}>
                    <span>{item.nome}</span>
                    <span className="num" style={{ fontWeight: 800 }}>
                      {item.qtd}
                    </span>
                    <span className="barra" aria-hidden="true">
                      <i style={{ width: `${(item.qtd / maiorItem) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Mesas ---------- */

const STATUS_MESA: Record<StatusMesa, { nome: string; icone?: NomeIcone; classe: string }> = {
  livre: { nome: "Livre", classe: "mesa-livre" },
  ocupada: { nome: "Ocupada", icone: "pessoas", classe: "mesa-ocupada" },
  conta: { nome: "Pediu a conta", icone: "conta", classe: "mesa-conta" },
  atencao: { nome: "Esperando atendimento", icone: "alerta", classe: "mesa-atencao" },
};

const FILTROS: { id: "todas" | StatusMesa; nome: string }[] = [
  { id: "todas", nome: "Todas" },
  { id: "livre", nome: "Livres" },
  { id: "ocupada", nome: "Ocupadas" },
  { id: "conta", nome: "Pediram a conta" },
];

function Mesas() {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todas");
  const [selecionada, setSelecionada] = useState<number>(4);
  const visiveis = mesas.filter((m) => filtro === "todas" || m.status === filtro);
  const mesa = mesas.find((m) => m.numero === selecionada);

  return (
    <>
      <div className="cab">
        <h1>Mesas</h1>
        <div className="direita">
          <button className="btn btn-primario" type="button">
            <Icone nome="mais" />
            Abrir mesa
          </button>
        </div>
      </div>

      <div className="mesas-filtros" role="toolbar" aria-label="Filtrar mesas">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" aria-pressed={f.id === filtro} onClick={() => setFiltro(f.id)}>
            {f.nome}
          </button>
        ))}
      </div>

      <div className="mesas-area">
        <div className="mesas-grade">
          {visiveis.map((m) => (
            <CartaoMesa
              key={m.numero}
              mesa={m}
              selecionada={m.numero === selecionada}
              onClick={() => setSelecionada(m.numero)}
            />
          ))}
        </div>
        {mesa && mesa.status !== "livre" && <Comanda mesa={mesa} />}
      </div>
    </>
  );
}

function CartaoMesa({ mesa, selecionada, onClick }: { mesa: Mesa; selecionada: boolean; onClick: () => void }) {
  const s = STATUS_MESA[mesa.status];
  return (
    <button type="button" className={`mesa ${s.classe}`} aria-pressed={selecionada} onClick={onClick}>
      <span className="numeral">{mesa.numero}</span>
      <span className="mesa-status">
        {s.icone && <Icone nome={s.icone} tamanho={16} />}
        {s.nome}
      </span>
      {mesa.status !== "livre" && (
        <span className="info">
          <span>
            {mesa.pessoas} pessoas, {mesa.abertaHa}
          </span>
          <strong className="num">{reais(mesa.totalCentavos ?? 0)}</strong>
        </span>
      )}
    </button>
  );
}

function Comanda({ mesa }: { mesa: Mesa }) {
  const subtotal = mesa.totalCentavos ?? 0;
  const servico = Math.round(subtotal * 0.1);
  const pago = mesa.numero === 4 ? 8000 : 0;
  return (
    <aside className="comanda ticket" aria-label={`Comanda da mesa ${mesa.numero}`}>
      <div className="ticket-linha suave">
        <span>Garçom: {mesa.garcom}</span>
        <span>aberta há {mesa.abertaHa}</span>
      </div>
      <p style={{ marginTop: 8 }}>
        <span className="numeral">Mesa {mesa.numero}</span>
      </p>
      <hr className="ticket-corte" />
      <h2>Rodadas</h2>
      <ul style={{ marginTop: 10 }}>
        <li className="ticket-linha">
          <span>
            <b>2×</b> Parmegiana de frango
          </span>
          <span className="num">{reais(7780)}</span>
        </li>
        <li className="ticket-linha">
          <span>
            <b>6×</b> Guaraná lata
          </span>
          <span className="num">{reais(3900)}</span>
        </li>
        <li className="ticket-linha">
          <span>
            <b>1×</b> Lasanha bolonhesa
          </span>
          <span className="num">{reais(4290)}</span>
        </li>
        <li className="ticket-linha suave">
          <span>
            <s>1× Fritas média</s> cancelado
          </span>
        </li>
      </ul>
      <hr className="ticket-corte" />
      <div className="ticket-linha">
        <span>Subtotal</span>
        <span className="num">{reais(subtotal)}</span>
      </div>
      <div className="ticket-linha">
        <span>Serviço 10%</span>
        <span className="num">{reais(servico)}</span>
      </div>
      {pago > 0 && (
        <div className="ticket-linha">
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span className="etiqueta e-feito">
              <Icone nome="check" tamanho={14} />
              Pago
            </span>
            Pix, pessoa 1
          </span>
          <span className="num">−{reais(pago)}</span>
        </div>
      )}
      <hr className="ticket-corte" />
      <div className="ticket-linha">
        <span className="total">Falta pagar</span>
        <span className="total num">{reais(subtotal + servico - pago)}</span>
      </div>
      <div className="comanda-acoes">
        <button className="btn btn-claro" type="button">
          <Icone nome="mais" />
          Lançar rodada
        </button>
        <button className="btn btn-primario" type="button">
          Fechar conta
        </button>
      </div>
    </aside>
  );
}

/* ---------- Cozinha ---------- */

const COLUNAS: { status: StatusPedido; nome: string; acao: string }[] = [
  { status: "novo", nome: "Novos", acao: "Começar preparo" },
  { status: "preparo", nome: "Em preparo", acao: "Marcar como pronto" },
  { status: "pronto", nome: "Prontos", acao: "Entregue" },
];

function Cozinha() {
  return (
    <>
      <div className="cab">
        <h1>Cozinha</h1>
        <div className="direita">
          <span className="etiqueta e-neutra">
            <Icone nome="impressora" tamanho={16} />
            Impressão automática ligada
          </span>
        </div>
      </div>
      <div className="cozinha">
        {COLUNAS.map((c) => {
          const lista = pedidos.filter((p) => p.status === c.status);
          return (
            <section className="coluna" key={c.status} aria-label={c.nome}>
              <h2>
                {c.nome} <span className="numeral">{lista.length}</span>
              </h2>
              <div className="coluna-lista">
                {lista.map((p) => (
                  <CartaoPedido key={p.numero} pedido={p} acao={c.acao} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

const FAIXA: Record<StatusPedido, { classe: string; nome: string; icone: NomeIcone }> = {
  novo: { classe: "f-novo", nome: "Novo", icone: "mais" },
  preparo: { classe: "f-preparo", nome: "Em preparo", icone: "cozinha" },
  pronto: { classe: "f-pronto", nome: "Pronto", icone: "check" },
};

function CartaoPedido({ pedido, acao }: { pedido: Pedido; acao: string }) {
  const f = pedido.atrasado
    ? { classe: "f-atrasado", nome: "Atrasado", icone: "alerta" as const }
    : FAIXA[pedido.status];
  return (
    <article className="ticket pedido">
      <div className={`pedido-faixa ${f.classe}`}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <Icone nome={f.icone} tamanho={16} />
          {f.nome}
        </span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <Icone nome="relogio" tamanho={16} />
          {pedido.ha}
        </span>
      </div>
      <div className="ticket-linha" style={{ alignItems: "end" }}>
        <span className="numeral">{pedido.numero}</span>
        <strong>{pedido.origem}</strong>
      </div>
      <ul className="pedido-itens">
        {pedido.itens.map((item) => (
          <li key={item.nome}>
            <b className="num">{item.qtd}×</b>
            {item.nome}
            {item.obs && <span className="obs">{item.obs}</span>}
          </li>
        ))}
      </ul>
      <button className={`btn ${pedido.status === "pronto" ? "btn-claro" : "btn-primario"}`} type="button">
        {acao}
      </button>
    </article>
  );
}
