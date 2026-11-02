import { useCallback, useEffect, useState } from "react";
import {
  ACTIVE_STATUSES,
  can,
  formatMoney,
  ORDER_ORIGIN_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  type Order,
  type OrderStatus,
} from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { useSessao } from "@/lib/useSessao";
import { Aviso, Botao, Campo, Dialogo, Etiqueta, type TomEtiqueta } from "@/ui/componentes";
import type { NomeIcone } from "@/ui/Icone";
import { apiPedidos } from "./api";
import { CancelarPedido } from "./CancelarPedido";
import { hora, TicketImpresso } from "./ticket";
import "./pedidos.css";

type Filtro = "todos" | "andamento" | "entregue" | "cancelado";
const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "todos", nome: "Todos" },
  { id: "andamento", nome: "Em andamento" },
  { id: "entregue", nome: "Entregues" },
  { id: "cancelado", nome: "Cancelados" },
];

export const TOM_STATUS: Record<OrderStatus, { tom: TomEtiqueta; icone: NomeIcone }> = {
  novo: { tom: "laranja", icone: "relogio" },
  preparo: { tom: "ambar", icone: "cozinha" },
  pronto: { tom: "feito", icone: "check" },
  entregue: { tom: "neutra", icone: "check" },
  cancelado: { tom: "brasa", icone: "fechar" },
};

/** Hoje no fuso do restaurante, no formato do campo de data. */
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

function passa(o: Order, f: Filtro) {
  if (f === "todos") return true;
  if (f === "andamento") return (ACTIVE_STATUSES as readonly string[]).includes(o.status);
  return o.status === f;
}

/** Pedidos de um dia, com filtro por situação, detalhe, reimpressão e cancelamento. */
export function Pedidos() {
  const atual = useSessao("membro");
  const membro = atual?.profile.member;
  const podeCancelar = !!membro && can(membro.role, membro.permissions, "orders.cancel");

  const [data, setData] = useState(hoje);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [lista, setLista] = useState<Order[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Order | null>(null);
  const [cancelando, setCancelando] = useState<Order | null>(null);
  const [imprimindo, setImprimindo] = useState<Order | null>(null);
  const [recado, setRecado] = useState("");

  const carregar = useCallback(async () => {
    setErro(null);
    setLista(null);
    try {
      setLista(await apiPedidos.doDia(data));
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível carregar os pedidos.");
    }
  }, [data]);

  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) void carregar();
  }, [carregar, data]);

  useEffect(() => {
    if (!imprimindo) return;
    const limpar = () => setImprimindo(null);
    window.addEventListener("afterprint", limpar, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", limpar);
  }, [imprimindo]);

  const visiveis = (lista ?? []).filter((o) => passa(o, filtro));
  const validos = (lista ?? []).filter((o) => o.status !== "cancelado");
  const vendido = validos.reduce((s, o) => s + o.totalCents, 0);

  return (
    <div>
      <div className="cab">
        <h1>Pedidos</h1>
      </div>

      <div className="pedidos-filtros">
        <Campo rotulo="Dia" type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
        <div className="filtros" role="group" aria-label="Situação">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="recado" role="status" aria-live="polite" style={{ marginTop: 0 }}>
        {recado}
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!lista && !erro && <p className="suave">Carregando...</p>}

      {lista && (
        <>
          <p className="resumo-dia">
            <span>
              <strong>{validos.length}</strong> {validos.length === 1 ? "pedido" : "pedidos"}
            </span>
            <span>
              <strong>{formatMoney(vendido)}</strong> em pedidos não cancelados
            </span>
          </p>
          {visiveis.length === 0 ? (
            <p className="suave">{lista.length === 0 ? "Nenhum pedido neste dia." : "Nenhum pedido com esta situação."}</p>
          ) : (
            <ul className="lista-pedidos">
              {visiveis.map((o) => (
                <li key={o.id} className={o.status === "cancelado" ? "pedido-cancelado" : undefined}>
                  <button type="button" className="pedido-linha" onClick={() => setAberto(o)}>
                    <span className="numeral">{o.number}</span>
                    <span className="resumo">
                      <strong>{o.customerName || ORDER_ORIGIN_LABELS[o.origin]}</strong>
                      <span className="suave">
                        {hora(o.createdAt)}, {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                      </span>
                    </span>
                    <Etiqueta {...TOM_STATUS[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Etiqueta>
                    <span className="valor num">{formatMoney(o.totalCents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {aberto && (
        <Dialogo
          aberto
          aoFechar={() => setAberto(null)}
          titulo={`Pedido ${aberto.number}`}
          acoes={
            <>
              {podeCancelar && (ACTIVE_STATUSES as readonly string[]).includes(aberto.status) && (
                <Botao variante="perigo" onClick={() => setCancelando(aberto)}>
                  Cancelar pedido
                </Botao>
              )}
              <Botao variante="claro" icone="impressora" onClick={() => setImprimindo(aberto)}>
                Imprimir
              </Botao>
              <Botao variante="claro" onClick={() => setAberto(null)}>
                Fechar
              </Botao>
            </>
          }
        >
          <div style={{ display: "grid", gap: 14 }}>
            <p>
              <Etiqueta {...TOM_STATUS[aberto.status]}>{ORDER_STATUS_LABELS[aberto.status]}</Etiqueta>{" "}
              <span className="suave">
                {ORDER_ORIGIN_LABELS[aberto.origin]}, {hora(aberto.createdAt)}
                {aberto.createdByName && `, lançado por ${aberto.createdByName}`}
              </span>
            </p>
            {aberto.customerName && (
              <p>
                Cliente: <strong>{aberto.customerName}</strong>
              </p>
            )}
            <ul className="detalhe-itens">
              {aberto.items.map((i) => (
                <li key={i.id}>
                  <span>
                    {i.quantity}× {i.name}
                    {(i.addons.length > 0 || i.removed.length > 0 || i.notes) && (
                      <span className="suave">
                        {[...i.addons.map((a) => `+ ${a.name}`), ...i.removed.map((r) => `sem ${r.toLowerCase()}`), i.notes]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                  </span>
                  <span className="num">{formatMoney(i.totalCents)}</span>
                </li>
              ))}
            </ul>
            {aberto.notes && <p className="ticket-obs">{aberto.notes}</p>}
            <dl className="totais">
              {aberto.discountCents > 0 && (
                <div>
                  <dt>Desconto</dt>
                  <dd className="num">− {formatMoney(aberto.discountCents)}</dd>
                </div>
              )}
              <div>
                <dt>
                  <strong>Total</strong>
                  {aberto.paymentMethod && <span className="suave"> ({PAYMENT_LABELS[aberto.paymentMethod]})</span>}
                </dt>
                <dd className="num">
                  <strong>{formatMoney(aberto.totalCents)}</strong>
                </dd>
              </div>
              {aberto.changeCents > 0 && (
                <div>
                  <dt>Troco</dt>
                  <dd className="num">{formatMoney(aberto.changeCents)}</dd>
                </div>
              )}
            </dl>
            {aberto.cancelReason && (
              <Aviso tom="info">Cancelado: {aberto.cancelReason}</Aviso>
            )}
          </div>
        </Dialogo>
      )}

      {cancelando && (
        <CancelarPedido
          pedido={cancelando}
          aoFechar={() => setCancelando(null)}
          aoCancelar={(p) => {
            setCancelando(null);
            setAberto(null);
            setLista((l) => (l ?? []).map((x) => (x.id === p.id ? p : x)));
            setRecado(`Pedido ${p.number} cancelado. O estoque foi devolvido.`);
          }}
        />
      )}
      {imprimindo && <TicketImpresso pedido={imprimindo} restaurante={atual?.profile.company.name ?? ""} />}
    </div>
  );
}
