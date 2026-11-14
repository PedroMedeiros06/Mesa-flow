import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  adminPlanAddonSchema,
  adminPlanSchema,
  BILLING_METHOD_LABELS,
  BILLING_METHODS,
  billingMonthSchema,
  formatMoney,
  generateInvoicesResultSchema,
  parseMoney,
  type AdminPlan,
  type AdminPlanAddon,
  type BillingMethod,
  type BillingMonth,
  type BillingRow,
  type Invoice,
} from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { textoPacote } from "@/lib/plano";
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
const reais = (c: number) => formatMoney(c).replace(/^R\$\s?/, "");

/** Mês atual (AAAA-MM) no fuso de São Paulo. */
const mesAtual = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
const somarMes = (m: string, n: number) => {
  const [a, b] = m.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(a, b - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const nomeMes = (m: string) =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const dataCurta = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });

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
      const { created } = generateInvoicesResultSchema.parse(
        await pedir("/admin/billing/generate", corpo("POST", { month: mes })),
      );
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
            <button
              type="button"
              className="link-btn"
              onClick={() => setMes((m) => somarMes(m, -1))}
              aria-label="Mês anterior"
            >
              ‹
            </button>
            <strong>{nomeMes(mes)}</strong>
            <button
              type="button"
              className="link-btn"
              onClick={() => setMes((m) => somarMes(m, 1))}
              aria-label="Próximo mês"
            >
              ›
            </button>
          </div>
        </div>
        <div className="direita">
          <Botao
            icone="cobranca"
            carregando={ocupado === "gerar"}
            textoCarregando="Gerando..."
            onClick={() => void gerar()}
            disabled={!dados}
          >
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
                    {r.subscription?.addons.map((a) => (
                      <span key={a.addonId} className="suave">
                        + {a.name}
                        {a.quantity > 1 && ` × ${a.quantity}`} · {formatMoney(a.quantity * a.unitPriceCents)}
                      </span>
                    ))}
                    {r.company.status === "blocked" && <span className="admin-motivo">Restaurante bloqueado</span>}
                  </div>
                  <div className="admin-uso">
                    {f ? (
                      <>
                        <span>
                          <strong className="num">{formatMoney(f.amountCents)}</strong> em{" "}
                          {nomeMes(f.reference.slice(0, 7)).split(" ")[0]}
                        </span>
                        <Situacao f={f} />
                      </>
                    ) : (
                      <span className="suave">{r.subscription ? "Fatura do mês ainda não gerada" : "Sem fatura"}</span>
                    )}
                    {r.overdue.count > 0 && (
                      <span className="admin-motivo">
                        {formatMoney(r.overdue.totalCents)} em atraso ({r.overdue.count}{" "}
                        {r.overdue.count === 1 ? "fatura" : "faturas"}, a mais antiga há {r.overdue.maxDaysLate} dias)
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
                            void acao(
                              `cancelar-${f.id}`,
                              () => pedir(`/admin/invoices/${f.id}/cancel`, { method: "POST" }),
                              "Fatura cancelada.",
                            )
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
                          void acao(
                            `desfazer-${f.id}`,
                            () => pedir(`/admin/invoices/${f.id}/reopen`, { method: "POST" }),
                            "Fatura voltou a pendente.",
                          )
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
            Nada é bloqueado sozinho. Para bloquear quem está em atraso, use Restaurantes. Desbloquear volta tudo como
            estava.
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
  const [planos, setPlanos] = useState<AdminPlan[] | null>(null);
  const [planoId, setPlanoId] = useState<string | null>(s?.planId ?? null);
  const [valor, setValor] = useState(s ? reais(s.priceCents) : "");
  const [dia, setDia] = useState(String(s?.dueDay ?? 10));
  const [adicionais, setAdicionais] = useState<AdminPlanAddon[] | null>(null);
  // Quantidade de pacotes de cada adicional (0 = sem o pacote).
  const [pacotes, setPacotes] = useState<Record<string, number>>(() =>
    Object.fromEntries((s?.addons ?? []).map((a) => [a.addonId, a.quantity])),
  );
  const [erros, setErros] = useState<{ planId?: string; priceCents?: string; dueDay?: string }>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    pedir("/admin/addons")
      .then((r) => setAdicionais(adminPlanAddonSchema.array().parse(r)))
      .catch(() => setAdicionais([]));
    pedir("/admin/plans")
      .then((r) => setPlanos(adminPlanSchema.array().parse(r)))
      .catch((falha: unknown) => setErro(mensagem(falha, "Não foi possível carregar os planos.")));
  }, []);

  // Mostra os planos ativos e também o atual do restaurante, mesmo que esteja fora do site.
  const opcoes = planos?.filter((p) => p.active || p.id === planoId) ?? [];
  const escolhido = planos?.find((p) => p.id === planoId);

  function escolher(p: AdminPlan) {
    setPlanoId(p.id);
    setValor(reais(p.priceCents));
    setErros((e) => ({ ...e, planId: undefined }));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const priceCents = parseMoney(valor);
    const dueDay = /^\d{1,2}$/.test(dia) ? Number(dia) : NaN;
    const novos = {
      planId: planoId ? undefined : "Escolha o plano",
      priceCents: !priceCents || priceCents < 1 ? "Valor inválido. Use, por exemplo, 99,90" : undefined,
      dueDay: !(dueDay >= 1 && dueDay <= 28) ? "Dia de 1 a 28" : undefined,
    };
    setErros(novos);
    if (novos.planId || novos.priceCents || novos.dueDay) return;
    setEnviando(true);
    setErro(null);
    try {
      const addons = Object.entries(pacotes)
        .filter(([, q]) => q > 0)
        .map(([addonId, quantity]) => ({ addonId, quantity }));
      await pedir(
        `/admin/companies/${linha.company.id}/subscription`,
        corpo("PUT", { planId: planoId, priceCents, dueDay, addons }),
      );
      aoSalvar();
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível salvar."));
      setEnviando(false);
    }
  }

  return (
    <Dialogo aberto largo aoFechar={aoFechar} titulo={`Plano: ${linha.company.name}`}>
      <form onSubmit={salvar} noValidate className="admin-form">
        {erro && <Aviso>{erro}</Aviso>}
        {s && !s.planId && (
          <p className="suave">
            Hoje: {s.plan}, {formatMoney(s.priceCents)}. Escolha um plano da lista para ligar a assinatura ao catálogo.
          </p>
        )}
        <fieldset className="pagamento">
          <legend>Plano</legend>
          {!planos ? (
            <p className="suave">Carregando os planos...</p>
          ) : opcoes.length === 0 ? (
            <p className="suave">Nenhum plano cadastrado. Crie um em Planos.</p>
          ) : (
            <div className="cobranca-sugestoes">
              {opcoes.map((p) => (
                <button key={p.id} type="button" aria-pressed={planoId === p.id} onClick={() => escolher(p)}>
                  {p.name} · {formatMoney(p.priceCents)}
                </button>
              ))}
            </div>
          )}
          {erros.planId && <span className="campo-erro">{erros.planId}</span>}
        </fieldset>
        <Campo
          rotulo="Valor deste restaurante por mês (R$)"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          erro={erros.priceCents}
          ajuda={
            escolhido && parseMoney(valor) !== escolhido.priceCents
              ? `Diferente do valor do plano (${formatMoney(escolhido.priceCents)}): desconto ou preço antigo.`
              : "Vem do plano; mude se este restaurante paga outro valor."
          }
        />
        <Campo
          rotulo="Dia do vencimento"
          inputMode="numeric"
          maxLength={2}
          value={dia}
          onChange={(e) => setDia(e.target.value.replace(/\D/g, ""))}
          erro={erros.dueDay}
          ajuda="De 1 a 28, para existir em todo mês."
        />
        {adicionais && adicionais.some((a) => a.active || pacotes[a.id]) && (
          <fieldset className="pagamento">
            <legend>Produtos à parte</legend>
            <ul className="cobranca-pacotes">
              {adicionais
                .filter((a) => a.active || pacotes[a.id])
                .map((a) => {
                  const q = pacotes[a.id] ?? 0;
                  const combinado = s?.addons.find((x) => x.addonId === a.id)?.unitPriceCents;
                  const unit = combinado ?? a.priceCents;
                  return (
                    <li key={a.id}>
                      <span>
                        <strong>{a.name}</strong>
                        <span className="suave">
                          {" "}
                          {/* O nome já costuma dizer o que o pacote faz ("+10 mesas"); senão, mostra. */}
                          {a.name.toLowerCase() === textoPacote(a.resource, a.amount).toLowerCase() ? "" : `${textoPacote(a.resource, a.amount)} · `}
                          {formatMoney(unit)} por pacote
                        </span>
                      </span>
                      <span className="cobranca-qtd">
                        <Botao
                          variante="claro"
                          pequeno
                          disabled={q === 0}
                          onClick={() => setPacotes((p) => ({ ...p, [a.id]: q - 1 }))}
                          aria-label={`Menos ${a.name}`}
                        >
                          −
                        </Botao>
                        <strong className="num" aria-live="polite">
                          {q}
                        </strong>
                        <Botao
                          variante="claro"
                          pequeno
                          disabled={q >= 99}
                          onClick={() => setPacotes((p) => ({ ...p, [a.id]: q + 1 }))}
                          aria-label={`Mais ${a.name}`}
                        >
                          +
                        </Botao>
                      </span>
                    </li>
                  );
                })}
            </ul>
          </fieldset>
        )}
        <p className="suave">
          Vale para as próximas faturas. As já geradas continuam com o valor delas; se a fatura deste mês já foi gerada,
          um pacote novo só entra no mês seguinte (ou cancele a fatura e gere de novo).
        </p>
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
          {fatura.plan}, {nomeMes(fatura.reference.slice(0, 7))}:{" "}
          <strong className="num">{formatMoney(fatura.amountCents)}</strong>
        </p>
        {fatura.items.length > 1 && (
          <dl className="cobranca-detalhe">
            {fatura.items.map((i) => (
              <div key={i.description}>
                <dt>{i.description}</dt>
                <dd className="num">{formatMoney(i.amountCents)}</dd>
              </div>
            ))}
          </dl>
        )}
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
        <Campo
          rotulo="Observação (opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          maxLength={200}
          placeholder="Ex.: comprovante no WhatsApp"
        />
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
