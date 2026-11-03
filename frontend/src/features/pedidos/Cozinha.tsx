import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVE_STATUSES,
  can,
  NEXT_STATUS,
  ORDER_ORIGIN_LABELS,
  ORDER_STATUS_LABELS,
  type Order,
  type OrderStatus,
} from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { useSessao } from "@/lib/useSessao";
import { Aviso, Botao, Comanda } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { apiPedidos } from "./api";
import { CancelarPedido } from "./CancelarPedido";
import { minutosDesde, TicketImpresso } from "./ticket";
import "./pedidos.css";

/** De quanto em quanto tempo a fila é relida. Tempo real (sem esperar) chega numa etapa futura. */
const INTERVALO_MS = 10_000;
/** Depois disso o tempo de espera fica em destaque. */
const ATRASO_MIN = 20;

const ACAO: Partial<Record<OrderStatus, string>> = {
  novo: "Começar preparo",
  preparo: "Marcar pronto",
  pronto: "Entregue",
};

/** Bipe curto gerado na hora (sem arquivo de áudio). */
function bipar(ctx: AudioContext) {
  for (const [atraso, freq] of [
    [0, 880],
    [0.18, 1175],
  ] as const) {
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.frequency.value = freq;
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime + atraso);
    ganho.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + atraso + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + atraso + 0.16);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(ctx.currentTime + atraso);
    osc.stop(ctx.currentTime + atraso + 0.18);
  }
}

/** Fila da cozinha em três colunas, relida sozinha, com aviso sonoro e impressão de 80 mm. */
export function Cozinha() {
  const atual = useSessao("membro");
  const membro = atual?.profile.member;
  const podeMudar = !!membro && can(membro.role, membro.permissions, "orders.change_status");
  const podeCancelar = !!membro && can(membro.role, membro.permissions, "orders.cancel");

  const [fila, setFila] = useState<Order[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mudando, setMudando] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<Order | null>(null);
  const [imprimindo, setImprimindo] = useState<Order | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [som, setSom] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const vistos = useRef<Set<string> | null>(null);

  const carregar = useCallback(async () => {
    try {
      const lista = await apiPedidos.fila();
      setErro(null);
      setAgora(Date.now());
      // Primeira leitura só registra; depois, pedido que não estava aqui = novo, toca o bipe.
      const novos = vistos.current ? lista.filter((o) => !vistos.current!.has(o.id)) : [];
      vistos.current = new Set(lista.map((o) => o.id));
      if (novos.length && audio.current) bipar(audio.current);
      setFila(lista);
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Sem conexão. Tentando de novo...");
    }
  }, []);

  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => void carregar(), INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [carregar]);

  // O navegador só deixa tocar som depois de um clique; por isso o botão "Ativar som".
  function alternarSom() {
    if (som) {
      void audio.current?.close();
      audio.current = null;
      setSom(false);
      return;
    }
    const ctx = new AudioContext();
    audio.current = ctx;
    bipar(ctx);
    setSom(true);
  }

  useEffect(() => {
    if (!imprimindo) return;
    const limpar = () => setImprimindo(null);
    window.addEventListener("afterprint", limpar, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", limpar);
  }, [imprimindo]);

  async function avancar(o: Order, para: OrderStatus) {
    setMudando(o.id);
    setAviso(null);
    try {
      const novo = await apiPedidos.mudarStatus(o.id, { from: o.status, to: para });
      setFila((f) => (f ?? []).map((x) => (x.id === o.id ? novo : x)).filter((x) => x.status !== "entregue"));
    } catch (falha) {
      setAviso(falha instanceof ApiErro ? falha.message : "Não foi possível mudar o pedido. Tente de novo.");
      await carregar();
    } finally {
      setMudando(null);
    }
  }

  const colunas = ACTIVE_STATUSES.map((s) => ({ status: s, pedidos: (fila ?? []).filter((o) => o.status === s) }));

  return (
    <div>
      <div className="cab cozinha-cab">
        <div>
          <h1>Cozinha</h1>
          <p className="suave">Atualiza sozinha a cada {INTERVALO_MS / 1000} segundos.</p>
        </div>
        <div className="direita">
          <Botao variante={som ? "claro" : "primario"} icone={som ? "som" : "mudo"} onClick={alternarSom} aria-pressed={som}>
            {som ? "Som ligado" : "Ativar som"}
          </Botao>
        </div>
      </div>

      <div className="recado" role="status" aria-live="polite">
        {aviso}
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!fila && !erro && <p className="suave">Carregando a fila...</p>}

      {fila && (
        <div className="cozinha-colunas">
          {colunas.map((c) => (
            <section key={c.status} className="coluna" aria-label={ORDER_STATUS_LABELS[c.status]}>
              <h2>
                {ORDER_STATUS_LABELS[c.status]}
                <span className="num">{c.pedidos.length}</span>
              </h2>
              {c.pedidos.length === 0 ? (
                <p className="suave coluna-vazia">
                  {c.status === "novo" ? "Nenhum pedido esperando." : "Nada aqui agora."}
                </p>
              ) : (
                <ul className="coluna-lista">
                  {c.pedidos.map((o) => {
                    const min = minutosDesde(o.createdAt, agora);
                    const proximo = NEXT_STATUS[o.status];
                    return (
                      <li key={o.id}>
                        <Comanda como="article" className="ticket" aria-label={`Pedido ${o.number}`}>
                          <div className="ticket-cab">
                            <span className="numeral">{o.number}</span>
                            <span className="suave">
                              {o.tabLabel ? <strong className="ticket-mesa">{o.tabLabel}</strong> : ORDER_ORIGIN_LABELS[o.origin]}
                              <br />
                              <span className={`ticket-espera ${min >= ATRASO_MIN ? "ticket-atrasado" : ""}`}>
                                {min < 1 ? "agora" : `há ${min} min`}
                              </span>
                            </span>
                          </div>
                          {o.customerName && <span className="ticket-cliente">{o.customerName}</span>}
                          <ul className="ticket-itens">
                            {o.items.map((i) => (
                              <li key={i.id} className={i.cancelled ? "ticket-item-cancelado" : undefined}>
                                <span className="qtd-x num">{i.quantity}×</span>
                                <strong>
                                  {i.name}
                                  {i.cancelled && <span className="tirar"> (cancelado)</span>}
                                </strong>
                                {(i.addons.length > 0 || i.removed.length > 0 || i.notes) && (
                                  <ul>
                                    {i.addons.map((a) => (
                                      <li key={a.name}>+ {a.name}</li>
                                    ))}
                                    {i.removed.map((r) => (
                                      <li key={r} className="tirar">
                                        Sem {r.toLowerCase()}
                                      </li>
                                    ))}
                                    {i.notes && <li>“{i.notes}”</li>}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                          {o.notes && <p className="ticket-obs">{o.notes}</p>}
                          <div className="ticket-acoes">
                            {podeMudar && proximo && (
                              <Botao
                                pequeno
                                variante={o.status === "pronto" ? "contorno" : "primario"}
                                carregando={mudando === o.id}
                                textoCarregando="Salvando..."
                                onClick={() => avancar(o, proximo)}
                              >
                                {ACAO[o.status]}
                              </Botao>
                            )}
                            {podeMudar && o.status !== "novo" && (
                              <button
                                type="button"
                                className="icone-btn"
                                title="Voltar um passo"
                                aria-label={`Voltar o pedido ${o.number} para ${ORDER_STATUS_LABELS[o.status === "pronto" ? "preparo" : "novo"]}`}
                                disabled={mudando === o.id}
                                onClick={() => avancar(o, o.status === "pronto" ? "preparo" : "novo")}
                              >
                                <Icone nome="voltar" tamanho={18} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="icone-btn"
                              title="Imprimir"
                              aria-label={`Imprimir o pedido ${o.number}`}
                              onClick={() => setImprimindo(o)}
                            >
                              <Icone nome="impressora" tamanho={18} />
                            </button>
                            {podeCancelar && (
                              <button
                                type="button"
                                className="icone-btn"
                                title="Cancelar pedido"
                                aria-label={`Cancelar o pedido ${o.number}`}
                                onClick={() => setCancelando(o)}
                              >
                                <Icone nome="fechar" tamanho={18} />
                              </button>
                            )}
                          </div>
                        </Comanda>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {cancelando && (
        <CancelarPedido
          pedido={cancelando}
          aoFechar={() => setCancelando(null)}
          aoCancelar={(p) => {
            setCancelando(null);
            setFila((f) => (f ?? []).filter((x) => x.id !== p.id));
            setAviso(`Pedido ${p.number} cancelado. O estoque foi devolvido.`);
          }}
        />
      )}
      {imprimindo && <TicketImpresso pedido={imprimindo} restaurante={atual?.profile.company.name ?? ""} />}
    </div>
  );
}
