import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  BILLING_METHOD_LABELS,
  BILLING_METHODS,
  billingMonthSchema,
  formatMoney,
  generateInvoicesResultSchema,
  parseMoney,
  PLAN_SUGGESTIONS,
  type BillingMethod,
  type BillingMonth,
  type BillingRow,
  type Invoice,
} from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { sessao } from "@/lib/sessao";
import { Aviso, Botao, Campo, Comanda, Dialogo, Etiqueta } from "@/ui/componentes";
import "./admin.css";

const pedir = async (caminho: string, init?: RequestInit): Promise<unknown> =>
  (await sessao.requisicao("admin", caminho, init)).json();
const corpo = (method: string, dados?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: dados === undefined ? undefined : JSON.stringify(dados),
});
const mensagem = (falha: unknown, padrao: string) => (falha instanceof ApiErro ? falha.message : padrao);

/** Mês atual (AAAA-MM) no fuso de São Paulo. */
const mesAtual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
const somarMes = (m: string, n: number) => {
  const [a, b] = m.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(a, b - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const nomeMes = (m: string) =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const dataCurta = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

function Situacao({ f }: { f: Invoice }) {
  if (f.status === "paid") {
    return (
      <Etiqueta tom="feito" icone="check">
        Paga {f.paidAt && `em ${dataCurta(f.paidAt)}`}
        {f.paymentMethod && ` · ${BILLING_METHOD_LABELS[f.paymentMethod as BillingMethod] ?? f.paymentMethod}`}
      </Etiqueta>
    );
  }
  if (f.status === "canceled") return <Etiqueta tom="neutra">Cancelada</Etiqueta>;
  if (f.daysLate > 0) {
    return (
      <Etiqueta tom="brasa" icone="alerta">
        Atrasada há {f.daysLate} {f.daysLate === 1 ? "dia" : "dias"}
      </Etiqueta>
    );
  }
  return (
    <Etiqueta tom="ambar" icone="relogio">
      Vence {dataCurta(f.dueDate)}
    </Etiqueta>
  );
}

type Aberto = { tipo: "plano"; linha: BillingRow } | { tipo: "pagar"; linha: BillingRow; fatura: Invoice } | null;

/** /admin/cobranca: plano de cada restaurante, faturas do mês e baixa de pagamento. Nada bloqueia sozinho. */
export function Cobranca() {
  const [mes, setMes] = useState(mesAtual);
  const [dados, setDados] = useState<BillingMonth | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Aberto>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(billingMonthSchema.parse(await pedir(`/admin/billing?month=${mes}`)));
      setErro(null);
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível carregar a cobrança."));
    }
  }, [mes]);

  useEffect(() => void carregar(), [carregar]);

  async function acao(chave: string, fazer: () => Promise<unknown>, ok?: string) {
    setOcupado(chave);
    setErro(null);
    setRecado(null);
    try {
      await fazer();
      if (ok) setRecado(ok);
      await carregar();
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível concluir. Tente de novo."));
    } finally {
      setOcupado(null);
    }
  }

  const gerar = () =>
    acao("gerar", async () => {
      const { created } = generateInvoicesResultSchema.parse(await pedir("/admin/billing/generate", corpo("POST", { month: mes })));
      setRecado(
        created === 0
          ? `Nenhuma fatura nova: todos com plano já têm a fatura de ${nomeMes(mes)}.`
          : `${created} ${created === 1 ? "fatura gerada" : "faturas geradas"} para ${nomeMes(mes)}.`,
      );
    });

  const semFatura = dados?.rows.filter((r) => r.subscription && !r.invoice).length ?? 0;

  return (
    <>
      <div className="cab">
        <div>
          <h1>Cobrança</h1>
          <div className="cobranca-mes">
            <button type="button" className="link-btn" onClick={() => setMes((m) => somarMes(m, -1))} aria-label="Mês anterior">
              ‹
            </button>
            <strong>{nomeMes(mes)}</strong>
            <button type="button" className="link-btn" onClick={() => setMes((m) => somarMes(m, 1))} aria-label="Próximo mês">
              ›
            </button>
          </div>
        </div>
        <div className="direita">
          <Botao icone="cobranca" carregando={ocupado === "gerar"} textoCarregando="Gerando..." onClick={() => void gerar()} disabled={!dados}>
            Gerar faturas de {nomeMes(mes).split(" ")[0]}
            {semFatura > 0 && ` (${semFatura})`}
          </Botao>
        </div>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {recado && (
        <p role="status" className="cobranca-recado">
          {recado}
        </p>
      )}
      {!dados && !erro && <p className="suave">Carregando...</p>}

      {dados && (
        <>
          <div className="cobranca-totais">
            <Comanda>
              <span className="suave">Recebido no mês</span>
              <strong className="numeral">{formatMoney(dados.totals.paidCents)}</strong>
            </Comanda>
            <Comanda>
              <span className="suave">A receber no mês</span>
              <strong className="numeral">{formatMoney(dados.totals.pendingCents)}</strong>
            </Comanda>
            <Comanda>
              <span className="suave">Atrasado (todos os meses)</span>
              <strong className="numeral">{formatMoney(dados.totals.overdueCents)}</strong>
            </Comanda>
          </div>

          <ul className="admin-lista">
            {dados.rows.map((r) => {
              const f = r.invoice;
              return (
                <li key={r.company.id} data-bloqueado={r.company.status === "blocked" ? "" : undefined}>
                  <div className="admin-nome">
                    <strong>{r.company.name}</strong>
                    <span className="suave">
                      {r.subscription
                        ? `${r.subscription.plan} · ${formatMoney(r.subscription.priceCents)} · vence dia ${r.subscription.dueDay}`
                        : "Sem plano definido"}
                    </span>
                    {r.company.status === "blocked" && <span className="admin-motivo">Restaurante bloqueado</span>}
                  </div>
                  <div className="admin-uso">
                    {f ? (
                      <>
                        <span>
                          <strong className="num">{formatMoney(f.amountCents)}</strong> em {nomeMes(f.reference.slice(0, 7)).split(" ")[0]}
                        </span>
                        <Situacao f={f} />
                      </>
                    ) : (
                      <span className="suave">{r.subscription ? "Fatura do mês ainda não gerada" : "Sem fatura"}</span>
                    )}
                    {r.overdue.count > 0 && (
                      <span className="admin-motivo">
                        {formatMoney(r.overdue.totalCents)} em atraso ({r.overdue.count} {r.overdue.count === 1 ? "fatura" : "faturas"}, a mais
                        antiga há {r.overdue.maxDaysLate} dias)
                      </span>
                    )}
                  </div>
                  <div className="admin-acoes">
                    {f?.status === "pending" && (
                      <>
                        <Botao pequeno onClick={() => setAberto({ tipo: "pagar", linha: r, fatura: f })}>
                          Marcar paga
                        </Botao>
                        <Botao
                          pequeno
                          variante="claro"
                          carregando={ocupado === `cancelar-${f.id}`}
                          textoCarregando="Cancelando..."
                          onClick={() =>
                            void acao(`cancelar-${f.id}`, () => pedir(`/admin/invoices/${f.id}/cancel`, { method: "POST" }), "Fatura cancelada.")
                          }
                        >
                          Cancelar
                        </Botao>
                      </>
                    )}
                    {f && f.status !== "pending" && (
                      <Botao
                        pequeno
                        variante="claro"
                        carregando={ocupado === `desfazer-${f.id}`}
                        textoCarregando="Desfazendo..."
                        onClick={() =>
                          void acao(`desfazer-${f.id}`, () => pedir(`/admin/invoices/${f.id}/reopen`, { method: "POST" }), "Fatura voltou a pendente.")
                        }
                      >
                        {f.status === "paid" ? "Desfazer pagamento" : "Desfazer cancelamento"}
                      </Botao>
                    )}
                    <Botao pequeno variante="contorno" onClick={() => setAberto({ tipo: "plano", linha: r })}>
                      {r.subscription ? "Plano" : "Definir plano"}
                    </Botao>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="suave cobranca-nota">
            Nada é bloqueado sozinho. Para bloquear quem está em atraso, use Restaurantes. Desbloquear volta tudo como estava.
          </p>
        </>
      )}

      {aberto?.tipo === "plano" && (
        <EditarPlano
          linha={aberto.linha}
          aoFechar={() => setAberto(null)}
          aoSalvar={() => {
            setAberto(null);
            void carregar();
            setRecado("Plano salvo. Vale para as próximas faturas; as já geradas não mudam.");
          }}
        />
      )}
      {aberto?.tipo === "pagar" && (
        <MarcarPaga
          linha={aberto.linha}
          fatura={aberto.fatura}
          aoFechar={() => setAberto(null)}
          aoSalvar={() => {
            setAberto(null);
            void carregar();
            setRecado(`Pagamento de ${aberto.linha.company.name} registrado.`);
          }}
        />
      )}
    </>
  );
}

function EditarPlano({ linha, aoFechar, aoSalvar }: { linha: BillingRow; aoFechar: () => void; aoSalvar: () => void }) {
  const s = linha.subscription;
  const [plano, setPlano] = useState(s?.plan ?? PLAN_SUGGESTIONS[1].plan);
  const [valor, setValor] = useState(formatMoney(s?.priceCents ?? PLAN_SUGGESTIONS[1].priceCents).replace(/^R\$\s?/, ""));
  const [dia, setDia] = useState(String(s?.dueDay ?? 10));
  const [erros, setErros] = useState<{ plan?: string; priceCents?: string; dueDay?: string }>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const priceCents = parseMoney(valor);
    const dueDay = /^\d{1,2}$/.test(dia) ? Number(dia) : NaN;
    const novos = {
      plan: plano.trim().length < 2 ? "Informe o plano" : undefined,
      priceCents: !priceCents || priceCents < 1 ? "Valor inválido. Use, por exemplo, 99,90" : undefined,
      dueDay: !(dueDay >= 1 && dueDay <= 28) ? "Dia de 1 a 28" : undefined,
    };
    setErros(novos);
    if (novos.plan || novos.priceCents || novos.dueDay) return;
    setEnviando(true);
    setErro(null);
    try {
      await pedir(`/admin/companies/${linha.company.id}/subscription`, corpo("PUT", { plan: plano, priceCents, dueDay }));
      aoSalvar();
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível salvar."));
      setEnviando(false);
    }
  }

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={`Plano: ${linha.company.name}`}>
      <form onSubmit={salvar} noValidate className="admin-form">
        {erro && <Aviso>{erro}</Aviso>}
        <div className="cobranca-sugestoes" role="group" aria-label="Planos sugeridos">
          {PLAN_SUGGESTIONS.map((p) => (
            <button
              key={p.plan}
              type="button"
              aria-pressed={plano === p.plan}
              onClick={() => {
                setPlano(p.plan);
                setValor(formatMoney(p.priceCents).replace(/^R\$\s?/, ""));
              }}
            >
              {p.plan} · {formatMoney(p.priceCents)}
            </button>
          ))}
        </div>
        <Campo rotulo="Nome do plano" value={plano} onChange={(e) => setPlano(e.target.value)} erro={erros.plan} maxLength={40} />
        <Campo rotulo="Valor por mês (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} erro={erros.priceCents} />
        <Campo
          rotulo="Dia do vencimento"
          inputMode="numeric"
          maxLength={2}
          value={dia}
          onChange={(e) => setDia(e.target.value.replace(/\D/g, ""))}
          erro={erros.dueDay}
          ajuda="De 1 a 28, para existir em todo mês."
        />
        <p className="suave">Vale para as próximas faturas. As já geradas continuam com o valor delas.</p>
        <div className="dialogo-acoes">
          <Botao variante="claro" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao type="submit" carregando={enviando} textoCarregando="Salvando...">
            Salvar plano
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}

function MarcarPaga({
  linha,
  fatura,
  aoFechar,
  aoSalvar,
}: {
  linha: BillingRow;
  fatura: Invoice;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [metodo, setMetodo] = useState<BillingMethod | null>(null);
  const [nota, setNota] = useState("");
  const [erroMetodo, setErroMetodo] = useState<string>();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!metodo) {
      setErroMetodo("Escolha como foi pago");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await pedir(`/admin/invoices/${fatura.id}/pay`, corpo("POST", { method: metodo, note: nota }));
      aoSalvar();
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível registrar."));
      setEnviando(false);
    }
  }

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={`Pagamento: ${linha.company.name}`}>
      <form onSubmit={salvar} noValidate className="admin-form">
        <p>
          {fatura.plan}, {nomeMes(fatura.reference.slice(0, 7))}: <strong className="num">{formatMoney(fatura.amountCents)}</strong>
        </p>
        {erro && <Aviso>{erro}</Aviso>}
        <fieldset className="pagamento">
          <legend>Como foi pago</legend>
          <div className="cobranca-sugestoes">
            {BILLING_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metodo === m}
                onClick={() => {
                  setMetodo(m);
                  setErroMetodo(undefined);
                }}
              >
                {BILLING_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          {erroMetodo && <span className="campo-erro">{erroMetodo}</span>}
        </fieldset>
        <Campo rotulo="Observação (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Ex.: comprovante no WhatsApp" />
        <div className="dialogo-acoes">
          <Botao variante="claro" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao type="submit" carregando={enviando} textoCarregando="Registrando...">
            Marcar como paga
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}
