import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  DEFAULT_SERVICE_FEE_BPS,
  formatMoney,
  ORDER_STATUS_LABELS,
  parseMoney,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  splitEvenly,
  TAB_STATUS_LABELS,
  type Order,
  type OrderItem,
  type PaymentMethod,
  type TabDetail,
  type TabPayment,
  type TabSummary,
} from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { useSessao } from "@/lib/useSessao";
import { Aviso, Botao, Campo, Comanda, CorteComanda, Dialogo, Etiqueta, Seletor } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { hora } from "../pedidos/ticket";
import { TOM_STATUS } from "../pedidos/Pedidos";
import { Quantidade } from "../pedidos/Quantidade";
import { EVENTO_CHAMADO_ATENDIDO } from "./AlertaChamados";
import { apiMesas } from "./api";
import { PedirMotivo } from "./PedirMotivo";

const INTERVALO_MS = 15_000;

export interface Pode {
  lancar: boolean;
  cancelar: boolean;
  transferir: boolean;
  fechar: boolean;
  reabrir: boolean;
  /** Imprimir e trocar o QR das mesas. */
  qr: boolean;
}

type Acao =
  | { tipo: "cancelarItem"; item: OrderItem; pedido: Order }
  | { tipo: "transferir"; pedido: Order }
  | { tipo: "juntar" }
  | { tipo: "estornar"; pagamento: TabPayment }
  | { tipo: "reabrir" }
  | { tipo: "fechar" };

/** Conta de uma mesa: rodadas, taxa, divisão, pagamentos, fechar e reabrir. */
export function Conta({
  id,
  pode,
  aoVoltar,
  aoLancar,
  aoIrPara,
}: {
  id: string;
  pode: Pode;
  aoVoltar: () => void;
  aoLancar: (c: TabDetail) => void;
  /** Depois de juntar, a conta que vale é a de destino. */
  aoIrPara: (id: string) => void;
}) {
  const [c, setC] = useState<TabDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [mudandoTaxa, setMudandoTaxa] = useState(false);
  const [atendendo, setAtendendo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setC(await apiMesas.ver(id));
      setErro(null);
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Sem conexão. Tentando de novo...");
    }
  }, [id]);

  // Outro garçom pode lançar na mesma mesa: relê de tempos em tempos (parado enquanto um diálogo está aberto).
  useEffect(() => {
    void carregar();
    if (acao) return;
    const t = window.setInterval(() => void carregar(), INTERVALO_MS);
    return () => window.clearInterval(t);
  }, [carregar, acao]);

  const feito = (novo: TabDetail, msg: string) => {
    setC(novo);
    setAcao(null);
    setRecado(msg);
  };

  const padraoSessao = useSessao("membro")?.profile.company.serviceFeeBps ?? 0;
  const taxaDeVolta = padraoSessao > 0 ? padraoSessao : DEFAULT_SERVICE_FEE_BPS;

  async function alternarTaxa() {
    if (!c) return;
    setMudandoTaxa(true);
    try {
      const novo = await apiMesas.taxa(c.id, c.serviceFeeBps > 0 ? 0 : taxaDeVolta);
      feito(novo, novo.serviceFeeBps > 0 ? "Taxa de serviço de volta na conta." : "Taxa de serviço retirada.");
    } catch (falha) {
      setRecado(falha instanceof ApiErro ? falha.message : "Não foi possível mudar a taxa.");
    } finally {
      setMudandoTaxa(false);
    }
  }

  async function atenderChamado() {
    if (!c) return;
    setAtendendo(true);
    try {
      feito(await apiMesas.atenderChamado(c.id), "Chamado atendido.");
      window.dispatchEvent(new Event(EVENTO_CHAMADO_ATENDIDO));
    } catch (falha) {
      setRecado(falha instanceof ApiErro ? falha.message : "Não foi possível marcar o chamado.");
    } finally {
      setAtendendo(false);
    }
  }

  if (!c) {
    return (
      <div>
        <button type="button" className="link-btn mesa-voltar" onClick={aoVoltar}>
          <Icone nome="voltar" tamanho={18} /> Mesas
        </button>
        {erro ? <Aviso>{erro}</Aviso> : <p className="suave">Carregando a conta...</p>}
      </div>
    );
  }

  const aberta = c.status === "aberta";
  const t = c.totals;
  const rodadas = c.orders.filter((o) => o.status !== "cancelado");
  const canceladas = c.orders.filter((o) => o.status === "cancelado");

  return (
    <div>
      <div className="cab">
        <div>
          <button type="button" className="link-btn mesa-voltar" onClick={aoVoltar}>
            <Icone nome="voltar" tamanho={18} /> Mesas
          </button>
          <h1>{c.label}</h1>
          <p className="suave">
            Aberta às {hora(c.openedAt)}
            {c.openedByName && ` por ${c.openedByName}`}
            {c.closedAt && `, ${c.status === "fechada" ? "fechada" : "juntada"} às ${hora(c.closedAt)}`}
          </p>
        </div>
        <div className="direita">
          {!aberta && (
            <Etiqueta tom={c.status === "fechada" ? "feito" : "neutra"} icone={c.status === "fechada" ? "check" : undefined}>
              {TAB_STATUS_LABELS[c.status]}
            </Etiqueta>
          )}
          {aberta && pode.transferir && (
            <Botao variante="claro" onClick={() => setAcao({ tipo: "juntar" })}>
              Juntar com outra mesa
            </Botao>
          )}
          {aberta && pode.lancar && (
            <Botao icone="mais" onClick={() => aoLancar(c)}>
              Nova rodada
            </Botao>
          )}
          {c.status === "fechada" && pode.reabrir && (
            <Botao variante="contorno" onClick={() => setAcao({ tipo: "reabrir" })}>
              Reabrir
            </Botao>
          )}
          {c.status === "juntada" && c.mergedIntoId && (
            <Botao variante="contorno" onClick={() => aoIrPara(c.mergedIntoId!)}>
              Ver a mesa de destino
            </Botao>
          )}
        </div>
      </div>

      <div className="recado" role="status" aria-live="polite">
        {recado}
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {aberta && c.callingSince && (
        <div className="conta-chamado" role="alert">
          <Icone nome="sino" tamanho={20} />
          <span>O cliente chamou o garçom pelo QR às {hora(c.callingSince)}.</span>
          <Botao pequeno carregando={atendendo} textoCarregando="Marcando..." onClick={() => void atenderChamado()}>
            Marcar como atendido
          </Botao>
        </div>
      )}

      <div className="conta">
        <section className="conta-rodadas" aria-label="Rodadas">
          <h2 className="conta-sub">
            Rodadas <span className="num">{rodadas.length}</span>
          </h2>
          {rodadas.length === 0 && (
            <p className="suave">{aberta && pode.lancar ? "Nada lançado ainda. Use “Nova rodada”." : "Nada lançado."}</p>
          )}
          <ol className="lista-rodadas">
            {rodadas.map((o) => (
              <li key={o.id}>
                <div className="rodada-cab">
                  <span className="numeral">{o.number}</span>
                  <span className="suave">
                    {hora(o.createdAt)}
                    {o.createdByName && `, ${o.createdByName}`}
                  </span>
                  <Etiqueta {...TOM_STATUS[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Etiqueta>
                  {aberta && pode.transferir && (
                    <button type="button" className="link-btn" onClick={() => setAcao({ tipo: "transferir", pedido: o })}>
                      Transferir
                    </button>
                  )}
                </div>
                <ul className="rodada-itens">
                  {o.items.map((i) => (
                    <li key={i.id} className={i.cancelled ? "item-cancelado" : undefined}>
                      <span>
                        <span className="num">{i.quantity}×</span> {i.name}
                        {(i.addons.length > 0 || i.removed.length > 0 || i.notes || i.cancelled) && (
                          <span className="suave">
                            {i.cancelled
                              ? `Cancelado: ${i.cancelReason}`
                              : [...i.addons.map((a) => `+ ${a.name}`), ...i.removed.map((r) => `sem ${r.toLowerCase()}`), i.notes]
                                  .filter(Boolean)
                                  .join(", ")}
                          </span>
                        )}
                      </span>
                      <span className="num valor">{formatMoney(i.totalCents)}</span>
                      {aberta && pode.cancelar && !i.cancelled ? (
                        <button
                          type="button"
                          className="icone-btn"
                          title="Cancelar item"
                          aria-label={`Cancelar ${i.quantity}× ${i.name}`}
                          onClick={() => setAcao({ tipo: "cancelarItem", item: i, pedido: o })}
                        >
                          <Icone nome="fechar" tamanho={16} />
                        </button>
                      ) : (
                        <span />
                      )}
                    </li>
                  ))}
                </ul>
                {o.notes && <p className="ticket-obs">{o.notes}</p>}
              </li>
            ))}
          </ol>
          {canceladas.length > 0 && (
            <p className="suave conta-canceladas">
              {canceladas.length === 1 ? "1 rodada cancelada" : `${canceladas.length} rodadas canceladas`} (pedido{" "}
              {canceladas.map((o) => o.number).join(", ")}).
            </p>
          )}

          <details className="historico">
            <summary>Histórico da mesa</summary>
            <ol>
              {c.events.map((e, n) => (
                <li key={n}>
                  <span className="num suave">{hora(e.createdAt)}</span>
                  <span>
                    {e.description}
                    {e.memberName && <span className="suave">, {e.memberName}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        </section>

        <aside className="conta-lado">
          <Comanda como="section" className="balcao-comanda" aria-label="Conta">
            <h2 className="balcao-titulo">Conta</h2>
            <dl className="totais">
              <div>
                <dt>Consumo</dt>
                <dd className="num">{formatMoney(t.subtotalCents)}</dd>
              </div>
              <div>
                <dt>
                  Serviço ({(c.serviceFeeBps / 100).toLocaleString("pt-BR")}%)
                  {aberta && pode.fechar && (
                    <>
                      {" "}
                      <button type="button" className="link-btn" disabled={mudandoTaxa} onClick={alternarTaxa}>
                        {c.serviceFeeBps > 0 ? "tirar" : `pôr ${(taxaDeVolta / 100).toLocaleString("pt-BR")}%`}
                      </button>
                    </>
                  )}
                </dt>
                <dd className="num">{formatMoney(t.serviceFeeCents)}</dd>
              </div>
              <div className="total">
                <dt>Total</dt>
                <dd className="numeral">{formatMoney(t.totalCents)}</dd>
              </div>
              {t.paidCents > 0 && (
                <>
                  <div>
                    <dt>Pago</dt>
                    <dd className="num">− {formatMoney(t.paidCents)}</dd>
                  </div>
                  <div className={t.remainingCents > 0 ? "falta" : undefined}>
                    <dt>Falta</dt>
                    <dd className="num">{formatMoney(t.remainingCents)}</dd>
                  </div>
                </>
              )}
            </dl>

            {c.payments.length > 0 && (
              <>
                <CorteComanda />
                <ul className="pagamentos">
                  {c.payments.map((p) => (
                    <li key={p.id} className={p.voided ? "item-cancelado" : undefined}>
                      <span>
                        {PAYMENT_LABELS[p.method]}
                        {p.payerLabel && `, ${p.payerLabel}`}
                        <span className="suave">
                          {p.voided
                            ? `Estornado: ${p.voidReason}`
                            : `${hora(p.createdAt)}${p.changeCents > 0 ? `, troco ${formatMoney(p.changeCents)}` : ""}`}
                        </span>
                      </span>
                      <span className="num valor">{formatMoney(p.amountCents)}</span>
                      {aberta && pode.fechar && !p.voided ? (
                        <button
                          type="button"
                          className="icone-btn"
                          title="Estornar pagamento"
                          aria-label={`Estornar ${formatMoney(p.amountCents)} em ${PAYMENT_LABELS[p.method]}`}
                          onClick={() => setAcao({ tipo: "estornar", pagamento: p })}
                        >
                          <Icone nome="fechar" tamanho={16} />
                        </button>
                      ) : (
                        <span />
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {aberta && pode.fechar && t.remainingCents > 0 && (
              <>
                <CorteComanda />
                <Pagar comanda={c} aoPagar={(novo, msg) => feito(novo, msg)} />
              </>
            )}

            {aberta && pode.fechar && (
              <Botao
                largo
                variante={t.remainingCents === 0 ? "primario" : "claro"}
                icone="check"
                disabled={t.remainingCents > 0 || t.totalCents === 0}
                onClick={() => setAcao({ tipo: "fechar" })}
              >
                Fechar conta
              </Botao>
            )}
            {aberta && pode.fechar && t.remainingCents > 0 && t.totalCents > 0 && (
              <p className="suave conta-dica">Para fechar, registre os pagamentos até zerar o que falta.</p>
            )}
          </Comanda>
        </aside>
      </div>

      {acao?.tipo === "cancelarItem" && (
        <PedirMotivo
          titulo={`Cancelar ${acao.item.quantity}× ${acao.item.name}?`}
          texto={
            acao.pedido.status === "novo"
              ? "O item sai da conta e os ingredientes voltam para o estoque (a cozinha ainda não começou)."
              : "O item sai da conta. Como a cozinha já começou, os ingredientes não voltam para o estoque."
          }
          rotuloBotao="Cancelar item"
          textoCarregando="Cancelando..."
          exemplo="Ex.: lançado errado, cliente desistiu"
          aoFechar={() => setAcao(null)}
          aoConfirmar={async (m) => feito(await apiMesas.cancelarItem(c.id, acao.item.id, m), `${acao.item.name} cancelado.`)}
        />
      )}
      {acao?.tipo === "estornar" && (
        <PedirMotivo
          titulo={`Estornar ${formatMoney(acao.pagamento.amountCents)}?`}
          texto="O valor volta a faltar na conta. O pagamento fica no histórico como estornado."
          rotuloBotao="Estornar"
          textoCarregando="Estornando..."
          exemplo="Ex.: cartão recusado, valor errado"
          aoFechar={() => setAcao(null)}
          aoConfirmar={async (m) => feito(await apiMesas.estornar(c.id, acao.pagamento.id, m), "Pagamento estornado.")}
        />
      )}
      {acao?.tipo === "reabrir" && (
        <PedirMotivo
          titulo={`Reabrir ${c.label}?`}
          texto="A conta volta a aceitar rodadas e pagamentos. Fica registrado no histórico quem reabriu e por quê."
          rotuloBotao="Reabrir"
          textoCarregando="Reabrindo..."
          variante="primario"
          exemplo="Ex.: faltou lançar a sobremesa"
          aoFechar={() => setAcao(null)}
          aoConfirmar={async (m) => feito(await apiMesas.reabrir(c.id, m), "Conta reaberta.")}
        />
      )}
      {acao?.tipo === "fechar" && (
        <Fechar comanda={c} aoFechar={() => setAcao(null)} aoFechada={(novo) => feito(novo, `${novo.label} fechada.`)} />
      )}
      {(acao?.tipo === "transferir" || acao?.tipo === "juntar") && (
        <EscolherMesa
          titulo={acao.tipo === "juntar" ? `Juntar ${c.label} com qual mesa?` : `Transferir o pedido ${acao.pedido.number} para qual mesa?`}
          texto={
            acao.tipo === "juntar"
              ? `Rodadas e pagamentos de ${c.label} passam para a mesa escolhida, e ${c.label} fica livre.`
              : "A rodada inteira sai desta conta e entra na conta da mesa escolhida."
          }
          rotuloBotao={acao.tipo === "juntar" ? "Juntar" : "Transferir"}
          origem={c.id}
          aoFechar={() => setAcao(null)}
          aoEscolher={async (destino) => {
            if (acao.tipo === "juntar") {
              const novo = await apiMesas.juntar(c.id, destino.id);
              setAcao(null);
              aoIrPara(novo.id);
            } else {
              feito(await apiMesas.transferir(c.id, acao.pedido.id, destino.id), `Pedido ${acao.pedido.number} foi para ${destino.label}.`);
            }
          }}
        />
      )}
    </div>
  );
}

/** Registrar um pagamento. "Dividir" calcula partes iguais do que falta; cada parte vira um pagamento. */
function Pagar({ comanda, aoPagar }: { comanda: TabDetail; aoPagar: (c: TabDetail, msg: string) => void }) {
  const falta = comanda.totals.remainingCents;
  const [metodo, setMetodo] = useState<PaymentMethod | null>(null);
  const [valor, setValor] = useState("");
  const [recebido, setRecebido] = useState("");
  const [quem, setQuem] = useState("");
  const [pessoas, setPessoas] = useState(1);
  // Cobrou uma parte: depois de pago, o resto se divide entre quem ainda não pagou.
  const [parte, setParte] = useState<number | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [requisicao, setRequisicao] = useState(() => crypto.randomUUID());

  const partes = splitEvenly(falta, pessoas);
  const valorCents = valor.trim() ? parseMoney(valor) : falta;
  const recebidoCents = recebido.trim() ? parseMoney(recebido) : null;
  const troco = metodo === "dinheiro" && recebidoCents !== null && valorCents !== null ? recebidoCents - valorCents : null;

  const mexeu = () => {
    setRequisicao(crypto.randomUUID());
    setErro(null);
  };
  const umaParte = (cents: number) => {
    setValor((cents / 100).toFixed(2).replace(".", ","));
    mexeu();
    setParte(cents);
  };

  async function pagar(e: FormEvent) {
    e.preventDefault();
    const novos: Record<string, string> = {};
    if (!metodo) novos.method = "Escolha a forma de pagamento";
    if (valorCents === null || valorCents <= 0) novos.amountCents = "Valor inválido. Use, por exemplo, 25,00";
    else if (valorCents > falta) novos.amountCents = `Passa do que falta (${formatMoney(falta)})`;
    if (recebido.trim() && recebidoCents === null) novos.receivedCents = "Valor inválido";
    else if (troco !== null && troco < 0) novos.receivedCents = "Menor que o valor do pagamento";
    setErros(novos);
    if (Object.keys(novos).length || !metodo || valorCents === null) return;

    setEnviando(true);
    try {
      const novo = await apiMesas.pagar(comanda.id, {
        clientRequestId: requisicao,
        method: metodo,
        amountCents: valorCents,
        receivedCents: metodo === "dinheiro" ? recebidoCents : null,
        payerLabel: quem,
      });
      const msg = `${formatMoney(valorCents)} em ${PAYMENT_LABELS[metodo].toLowerCase()} registrado${troco && troco > 0 ? `. Troco: ${formatMoney(troco)}` : ""}.`;
      setValor("");
      setRecebido("");
      setQuem("");
      setMetodo(null);
      setRequisicao(crypto.randomUUID());
      if (parte !== null && parte === valorCents) setPessoas((n) => Math.max(1, n - 1));
      setParte(null);
      aoPagar(novo, msg);
    } catch (falha) {
      if (falha instanceof ApiErro) {
        const campo = falha.issues[0];
        if (campo) setErros({ [campo.path]: campo.message });
        else setErro(falha.message);
      } else {
        setErro("Não foi possível registrar. Tente de novo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="pagar" onSubmit={pagar} noValidate>
      <div className="dividir">
        <span>
          <strong>Dividir</strong>
          <span className="suave"> o que falta</span>
        </span>
        <Quantidade valor={pessoas} nome="pessoas" minimo={1} aoMudar={(q) => {
            setPessoas(Math.max(1, Math.min(q, 30)));
            setParte(null);
          }} />
      </div>
      {pessoas > 1 && (
        <div className="partes">
          <span className="suave">
            {pessoas} pessoas: {partes[0] === partes[partes.length - 1] ? `${formatMoney(partes[0]!)} cada` : `${formatMoney(partes[0]!)} ou ${formatMoney(partes[partes.length - 1]!)}`}
          </span>
          <button type="button" className="link-btn" onClick={() => umaParte(partes[0]!)}>
            Cobrar uma parte
          </button>
        </div>
      )}
      <fieldset className="pagamento">
        <legend>Pagamento</legend>
        <div className="segmentos segmentos-4">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={metodo === m}
              onClick={() => {
                setMetodo(m);
                mexeu();
              }}
            >
              {PAYMENT_LABELS[m]}
            </button>
          ))}
        </div>
        {erros.method && <span className="campo-erro">{erros.method}</span>}
      </fieldset>
      <div className="pagar-campos">
        <Campo
          rotulo="Valor"
          inputMode="decimal"
          placeholder={(falta / 100).toFixed(2).replace(".", ",")}
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            setParte(null);
            mexeu();
          }}
          erro={erros.amountCents}
          ajuda={valor.trim() ? undefined : "Vazio = tudo o que falta"}
        />
        <Campo
          rotulo="Quem paga (opcional)"
          value={quem}
          onChange={(e) => {
            setQuem(e.target.value);
            mexeu();
          }}
          maxLength={40}
          placeholder="Ex.: Pessoa 2"
        />
      </div>
      {metodo === "dinheiro" && (
        <Campo
          rotulo="Recebido (opcional)"
          inputMode="decimal"
          placeholder="0,00"
          value={recebido}
          onChange={(e) => {
            setRecebido(e.target.value);
            mexeu();
          }}
          erro={erros.receivedCents}
          ajuda={troco !== null && troco >= 0 ? `Troco: ${formatMoney(troco)}` : "Para calcular o troco"}
        />
      )}
      {erro && <Aviso>{erro}</Aviso>}
      <Botao type="submit" largo variante="contorno" carregando={enviando} textoCarregando="Registrando...">
        Registrar {valorCents !== null && valorCents > 0 ? formatMoney(valorCents) : "pagamento"}
      </Botao>
    </form>
  );
}

function Fechar({ comanda, aoFechar, aoFechada }: { comanda: TabDetail; aoFechar: () => void; aoFechada: (c: TabDetail) => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function fechar() {
    setEnviando(true);
    try {
      aoFechada(await apiMesas.fechar(comanda.id));
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível fechar. Tente de novo.");
      setEnviando(false);
    }
  }
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo={`Fechar ${comanda.label}?`}
      acoes={
        <>
          <Botao variante="claro" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao icone="check" carregando={enviando} textoCarregando="Fechando..." onClick={fechar}>
            Fechar em {formatMoney(comanda.totals.totalCents)}
          </Botao>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12 }}>
        <p className="suave">A conta está paga. Depois de fechar, a mesa fica livre e a conta só muda se alguém reabrir.</p>
        {erro && <Aviso>{erro}</Aviso>}
      </div>
    </Dialogo>
  );
}

function EscolherMesa({
  titulo,
  texto,
  rotuloBotao,
  origem,
  aoFechar,
  aoEscolher,
}: {
  titulo: string;
  texto: string;
  rotuloBotao: string;
  origem: string;
  aoFechar: () => void;
  aoEscolher: (destino: TabSummary) => Promise<void>;
}) {
  const [mesas, setMesas] = useState<TabSummary[] | null>(null);
  const [escolhida, setEscolhida] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    apiMesas.listar("abertas").then(
      (l) => setMesas(l.filter((m) => m.id !== origem)),
      () => setErro("Não foi possível carregar as mesas."),
    );
  }, [origem]);

  async function confirmar() {
    const destino = mesas?.find((m) => m.id === escolhida);
    if (!destino) return;
    setEnviando(true);
    try {
      await aoEscolher(destino);
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível salvar. Tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo={titulo}
      acoes={
        <>
          <Botao variante="claro" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao carregando={enviando} textoCarregando="Salvando..." disabled={!escolhida} onClick={confirmar}>
            {rotuloBotao}
          </Botao>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <p className="suave">{texto}</p>
        {erro && <Aviso>{erro}</Aviso>}
        {!mesas && !erro && <p className="suave">Carregando as mesas...</p>}
        {mesas && mesas.length === 0 && <p className="suave">Não há outra mesa aberta. Abra a mesa de destino primeiro.</p>}
        {mesas && mesas.length > 0 && (
          <Seletor rotulo="Mesa de destino" value={escolhida} onChange={(e) => setEscolhida(e.target.value)}>
            <option value="">Escolha</option>
            {mesas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({formatMoney(m.totals.totalCents)})
              </option>
            ))}
          </Seletor>
        )}
      </div>
    </Dialogo>
  );
}
