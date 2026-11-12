import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { formatMoney, type DashboardSummary } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Comanda } from "@/ui/componentes";
import { resumoDoDia } from "./api";
import "./inicio.css";

/** Atualiza sozinho: o dono deixa a tela aberta no caixa. */
const INTERVALO_MS = 60_000;

const diaCurto = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
const diaLongo = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

/** Resumo do dia na tela Início, para quem tem "Ver faturamento e relatórios". */
export function ResumoDia() {
  const [r, setR] = useState<DashboardSummary | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setR(await resumoDoDia());
      setErro(null);
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível carregar o resumo do dia.");
    }
  }, []);

  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => void carregar(), INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [carregar]);

  if (erro && !r) return <Aviso>{erro}</Aviso>;
  if (!r) return <p className="suave">Somando o dia...</p>;

  const origens = [
    ["Mesas", r.byOrigin.mesa],
    ["Balcão", r.byOrigin.balcao],
    ["Cardápio online", r.byOrigin.vitrine],
  ] as const;

  return (
    <section className="resumo" aria-label="Resumo do dia">
      <div className="resumo-numeros">
        <Comanda className="resumo-principal">
          <span className="suave">Vendido hoje</span>
          <strong className="numeral">{formatMoney(r.salesCents)}</strong>
          <span className="suave">
            {r.salesCount} {r.salesCount === 1 ? "venda" : "vendas"}
            {r.salesCount > 0 && `, ticket médio ${formatMoney(r.averageTicketCents)}`}
          </span>
        </Comanda>
        <Comanda>
          <span className="suave">Mesas abertas agora</span>
          <strong className="numeral">{r.openTabs.count}</strong>
          <span className="suave">
            {r.openTabs.count > 0 ? `${formatMoney(r.openTabs.totalCents)} em consumo` : "Nenhuma mesa aberta"}
          </span>
        </Comanda>
        <Comanda>
          <span className="suave">Na fila da cozinha</span>
          <strong className="numeral">{r.kitchenQueue}</strong>
          <Link to="/app/cozinha" className="resumo-link">
            Abrir a cozinha
          </Link>
        </Comanda>
      </div>

      <div className="resumo-blocos">
        <Comanda como="section" aria-label="Por onde vendeu">
          <h2>Por onde vendeu</h2>
          <dl className="resumo-origens">
            {origens.map(([nome, o]) => (
              <div key={nome}>
                <dt>
                  {nome} <span className="suave">({o.count})</span>
                </dt>
                <dd className="num">{formatMoney(o.totalCents)}</dd>
              </div>
            ))}
          </dl>
          <p className="suave resumo-nota">
            Taxa de serviço {formatMoney(r.serviceFeeCents)}. Descontos {formatMoney(r.discountCents)}.
            {r.cancelled.count > 0 &&
              ` ${r.cancelled.count} ${r.cancelled.count === 1 ? "pedido cancelado" : "pedidos cancelados"} (${formatMoney(r.cancelled.totalCents)}).`}
          </p>
        </Comanda>

        <Comanda como="section" aria-label="Mais vendidos hoje">
          <h2>Mais vendidos hoje</h2>
          {r.topItems.length === 0 ? (
            <p className="suave">Assim que sair o primeiro pedido, os campeões do dia aparecem aqui.</p>
          ) : (
            <ol className="resumo-top">
              {r.topItems.map((i) => (
                <li key={i.name}>
                  <span>{i.name}</span>
                  <span className="num">{i.quantity}×</span>
                  <span className="num suave">{formatMoney(i.totalCents)}</span>
                </li>
              ))}
            </ol>
          )}
        </Comanda>

        <Comanda como="section" aria-label="Vendas dos últimos 7 dias">
          <h2>Vendas dos últimos 7 dias</h2>
          <Semana dias={r.last7Days} />
        </Comanda>
      </div>
    </section>
  );
}

/**
 * Barras de uma série só: a altura é o valor do dia. Passar o mouse ou tocar mostra o valor em cima;
 * a tabela escondida dá os mesmos números para leitor de tela.
 */
function Semana({ dias }: { dias: DashboardSummary["last7Days"] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const maior = Math.max(...dias.map((d) => d.salesCents), 1);
  const ultimo = dias.length - 1;
  const mostrado = ativo ?? ultimo;
  const dia = dias[mostrado];
  if (!dia) return null;

  return (
    <>
      <p className="resumo-semana-valor">
        <span className="suave">{mostrado === ultimo ? "Hoje" : diaLongo(dia.date)}</span>
        <strong className="num">{formatMoney(dia.salesCents)}</strong>
      </p>
      <div className="barras" aria-hidden="true" onMouseLeave={() => setAtivo(null)}>
        {dias.map((d, i) => (
          <button
            key={d.date}
            type="button"
            tabIndex={-1}
            className="barra"
            data-ativa={i === mostrado ? "" : undefined}
            onMouseEnter={() => setAtivo(i)}
            onClick={() => setAtivo(i)}
          >
            <span className="barra-area">
              <span
                className="barra-valor"
                style={{ height: d.salesCents > 0 ? `max(4px, ${(d.salesCents / maior) * 100}%)` : 0 }}
              />
            </span>
            <span className="barra-dia">{i === ultimo ? "hoje" : diaCurto(d.date)}</span>
          </button>
        ))}
      </div>
      <table className="so-leitor">
        <caption>Vendas por dia</caption>
        <tbody>
          {dias.map((d) => (
            <tr key={d.date}>
              <th scope="row">{diaLongo(d.date)}</th>
              <td>{formatMoney(d.salesCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
