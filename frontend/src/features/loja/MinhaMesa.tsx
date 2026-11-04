import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { formatMoney, type OrderStatus, type PublicTab } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Comanda, CorteComanda, Marca } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { hora, minutosDesde } from "../pedidos/ticket";
import { apiLoja } from "./api";
import "../pedidos/pedidos.css";
import "./loja.css";

const INTERVALO_MS = 15_000;

/** O andamento de cada rodada na língua do cliente sentado à mesa. */
const PASSOS: { status: Exclude<OrderStatus, "cancelado">; nome: string }[] = [
  { status: "novo", nome: "Recebido" },
  { status: "preparo", nome: "Preparando" },
  { status: "pronto", nome: "Pronto" },
  { status: "entregue", nome: "Na mesa" },
];

function tempo(min: number) {
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

/**
 * Página do QR da mesa: o cliente vê há quanto tempo está ali, quem atendeu, o que pediu,
 * o andamento de cada pedido e o total até agora, e chama o garçom. Atualiza sozinha.
 */
export function MinhaMesa() {
  const { token = "" } = useParams();
  const [mesa, setMesa] = useState<PublicTab | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [chamando, setChamando] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  const ler = useCallback(async () => {
    try {
      const m = await apiLoja.mesa(token);
      setMesa(m);
      setErro(null);
      setAgora(Date.now());
      document.title = `Mesa ${m.tableNumber} | ${m.company.name}`;
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Sem conexão. Tentando de novo...");
    }
  }, [token]);

  useEffect(() => {
    void ler();
    const leitura = window.setInterval(() => void ler(), INTERVALO_MS);
    // O relógio de "há quanto tempo" anda entre uma leitura e outra.
    const relogio = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => {
      window.clearInterval(leitura);
      window.clearInterval(relogio);
    };
  }, [ler]);

  async function chamar() {
    setChamando(true);
    setRecado(null);
    try {
      const { calledAt } = await apiLoja.chamarGarcom(token);
      setMesa((m) => (m?.tab ? { ...m, tab: { ...m.tab, calledAt } } : m));
    } catch (falha) {
      setRecado(falha instanceof ApiErro ? falha.message : "Não foi possível chamar. Tente de novo.");
    } finally {
      setChamando(false);
    }
  }

  if (!mesa) {
    return (
      <main className="loja loja-erro">
        {erro ? <Aviso>{erro}</Aviso> : <p className="suave">Abrindo a sua mesa...</p>}
      </main>
    );
  }

  const t = mesa.tab;
  const min = t ? minutosDesde(t.openedAt, agora) : 0;

  return (
    <main className="loja minha-mesa">
      <header className="loja-topo">
        <p className="suave">{mesa.company.name}</p>
        <h1>{t?.label ?? `Mesa ${mesa.tableNumber}`}</h1>
        {t && (
          <p className="minha-mesa-meta">
            <span>
              <Icone nome="relogio" tamanho={16} /> Aberta há {tempo(min)}, às {hora(t.openedAt)}
            </span>
            {t.openedByName && (
              <span>
                <Icone nome="pessoas" tamanho={16} /> Atendido por {t.openedByName}
              </span>
            )}
          </p>
        )}
      </header>

      {erro && <Aviso>{erro}</Aviso>}

      {!t ? (
        <Comanda className="minha-mesa-vazia">
          <strong>Esta mesa está sem conta aberta agora.</strong>
          <p className="suave">Quando o garçom abrir a mesa, os pedidos e o total aparecem aqui sozinhos.</p>
        </Comanda>
      ) : (
        <>
          <section aria-label="Pedidos da mesa">
            {t.rounds.length === 0 && <p className="suave">Nada pedido ainda. Os pedidos aparecem aqui assim que o garçom lançar.</p>}
            <ol className="minha-mesa-rodadas">
              {t.rounds.map((r) => {
                const atual = PASSOS.findIndex((p) => p.status === r.status);
                return (
                  <li key={r.id}>
                    <Comanda como="article" aria-label={`Pedido ${r.number}`}>
                      <div className="minha-mesa-rodada-cab">
                        <strong>Pedido {r.number}</strong>
                        <span className="suave">{hora(r.createdAt)}</span>
                      </div>
                      <ul className="detalhe-itens">
                        {r.items.map((i, n) => (
                          <li key={n}>
                            <span>
                              {i.quantity}× {i.name}
                              {(i.addons.length > 0 || i.removed.length > 0) && (
                                <span className="suave">
                                  {[...i.addons.map((a) => `+ ${a}`), ...i.removed.map((x) => `sem ${x.toLowerCase()}`)].join(", ")}
                                </span>
                              )}
                            </span>
                            <span className="num">{formatMoney(i.totalCents)}</span>
                          </li>
                        ))}
                      </ul>
                      <ol className="andamento" aria-label="Andamento do pedido">
                        {PASSOS.map((p, i) => (
                          <li
                            key={p.status}
                            className={i <= atual ? "andamento-feito" : undefined}
                            aria-current={i === atual ? "step" : undefined}
                          >
                            {p.nome}
                          </li>
                        ))}
                      </ol>
                    </Comanda>
                  </li>
                );
              })}
            </ol>
          </section>

          <Comanda className="minha-mesa-total" aria-label="Total da mesa">
            <dl className="totais">
              <div>
                <dt>Consumo</dt>
                <dd className="num">{formatMoney(t.totals.subtotalCents)}</dd>
              </div>
              {t.totals.serviceFeeCents > 0 && (
                <div>
                  <dt>Taxa de serviço</dt>
                  <dd className="num">{formatMoney(t.totals.serviceFeeCents)}</dd>
                </div>
              )}
              {t.totals.paidCents > 0 && (
                <div>
                  <dt>Já pago</dt>
                  <dd className="num">{formatMoney(t.totals.paidCents)}</dd>
                </div>
              )}
            </dl>
            <CorteComanda />
            <div className="loja-total">
              <span>{t.totals.paidCents > 0 ? "Falta pagar" : "Total até agora"}</span>
              <strong className="numeral">
                {formatMoney(t.totals.paidCents > 0 ? t.totals.remainingCents : t.totals.totalCents)}
              </strong>
            </div>
          </Comanda>

          <div className="minha-mesa-chamar">
            {t.calledAt ? (
              <p className="minha-mesa-chamado" role="status">
                <Icone nome="check" tamanho={18} /> Garçom chamado às {hora(t.calledAt)}. Já vem até a sua mesa.
              </p>
            ) : (
              <Botao largo icone="sino" carregando={chamando} textoCarregando="Chamando..." onClick={() => void chamar()}>
                Chamar o garçom
              </Botao>
            )}
            {recado && <Aviso>{recado}</Aviso>}
          </div>
        </>
      )}

      <p className="suave" role="status">
        Esta página se atualiza sozinha.
      </p>
      <footer className="loja-rodape suave">
        Feito com <Marca className="loja-marca" />
      </footer>
    </main>
  );
}
