import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  adminPlanAddonSchema,
  adminPlanSchema,
  formatMoney,
  parseMoney,
  PLAN_MODULE_LABELS,
  PLAN_MODULES,
  PLAN_RESOURCE_LABELS,
  PLAN_RESOURCES,
  planAddonSavedSchema,
  planSavedSchema,
  type AdminPlan,
  type AdminPlanAddon,
  type PlanLimits,
  type PlanModules,
  type PlanResource,
} from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { textoLimite } from "@/lib/plano";
import { sessao } from "@/lib/sessao";
import { Aviso, Botao, Campo, CampoArea, Comanda, Dialogo, Etiqueta, Marcador, Seletor } from "@/ui/componentes";
import "./admin.css";

const pedir = async (caminho: string, init?: RequestInit): Promise<unknown> =>
  (await sessao.requisicao("admin", caminho, init)).json();
const corpo = (method: string, dados: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(dados),
});
const mensagem = (falha: unknown, padrao: string) => (falha instanceof ApiErro ? falha.message : padrao);
const reais = (c: number) => formatMoney(c).replace(/^R\$\s?/, "");

/** Texto do campo de limite: vazio = sem limite; senão inteiro positivo. */
const lerLimite = (t: string): number | null | undefined => {
  const v = t.trim();
  if (!v) return null;
  return /^\d{1,5}$/.test(v) && Number(v) >= 1 ? Number(v) : undefined;
};

/** /admin/planos: os planos que o MesaFlow vende. Os ativos aparecem no site, na ordem daqui. */
export function Planos() {
  const [lista, setLista] = useState<AdminPlan[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [editando, setEditando] = useState<AdminPlan | "novo" | null>(null);
  const [movendo, setMovendo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setLista(adminPlanSchema.array().parse(await pedir("/admin/plans")));
      setErro(null);
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível carregar os planos."));
    }
  }, []);

  useEffect(() => void carregar(), [carregar]);

  async function mover(i: number, delta: -1 | 1) {
    if (!lista) return;
    const ids = lista.map((p) => p.id);
    const j = i + delta;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    setMovendo(true);
    try {
      setLista(adminPlanSchema.array().parse(await pedir("/admin/plans/order", corpo("PUT", { ids }))));
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível mudar a ordem."));
    } finally {
      setMovendo(false);
    }
  }

  return (
    <>
      <div className="cab">
        <div>
          <h1>Planos</h1>
          <p className="suave" style={{ marginTop: 6 }}>
            Os planos ativos aparecem na página inicial do site, nesta ordem. Limites e partes incluídas valem de verdade
            no painel do restaurante; os itens são só texto para o site.
          </p>
        </div>
        <div className="direita">
          <Botao icone="mais" onClick={() => setEditando("novo")}>
            Novo plano
          </Botao>
        </div>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {recado && (
        <p role="status" className="cobranca-recado">
          {recado}
        </p>
      )}
      {!lista && !erro && <p className="suave">Carregando...</p>}

      {lista && (
        <ol className="planos-lista">
          {lista.map((p, i) => (
            <li key={p.id}>
              <Comanda
                className={`plano-admin ${p.highlighted ? "plano-admin-destaque" : ""} ${p.active ? "" : "plano-admin-inativo"}`}
              >
                <div className="plano-admin-cab">
                  <div>
                    <h2>{p.name}</h2>
                    <strong className="numeral">{formatMoney(p.priceCents)}</strong>
                    <span className="suave"> por mês</span>
                  </div>
                  <div className="plano-admin-etiquetas">
                    {p.highlighted && <Etiqueta tom="laranja">Destaque no site</Etiqueta>}
                    {!p.active && <Etiqueta tom="neutra">Fora do site</Etiqueta>}
                  </div>
                </div>
                {p.description && <p>{p.description}</p>}
                <ul className="plano-admin-limites">
                  {PLAN_RESOURCES.map((r) => (
                    <li key={r}>{textoLimite(r, p.limits[r])}</li>
                  ))}
                  {PLAN_MODULES.filter((m) => !p.modules[m]).map((m) => (
                    <li key={m} className="plano-admin-sem">
                      Sem {PLAN_MODULE_LABELS[m].toLowerCase()}
                    </li>
                  ))}
                </ul>
                {p.features.length > 0 && (
                  <ul className="plano-admin-itens">
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
                <p className="suave plano-admin-uso">
                  {p.subscribers === 0
                    ? "Nenhum restaurante neste plano."
                    : `${p.subscribers} ${p.subscribers === 1 ? "restaurante" : "restaurantes"} neste plano`}
                  {p.subscribersWithOtherPrice > 0 && `, ${p.subscribersWithOtherPrice} pagando outro valor`}
                  {p.subscribers > 0 && "."}
                </p>
                <div className="admin-acoes plano-admin-acoes">
                  <Botao
                    variante="claro"
                    pequeno
                    icone="cima"
                    disabled={i === 0 || movendo}
                    onClick={() => void mover(i, -1)}
                    aria-label={`Subir ${p.name}`}
                  >
                    Subir
                  </Botao>
                  <Botao
                    variante="claro"
                    pequeno
                    icone="baixo"
                    disabled={i === lista.length - 1 || movendo}
                    onClick={() => void mover(i, 1)}
                    aria-label={`Descer ${p.name}`}
                  >
                    Descer
                  </Botao>
                  <Botao variante="contorno" pequeno icone="lapis" onClick={() => setEditando(p)}>
                    Editar
                  </Botao>
                </div>
              </Comanda>
            </li>
          ))}
        </ol>
      )}

      <Adicionais />

      {editando && (
        <EditorPlano
          plano={editando === "novo" ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={(texto) => {
            setEditando(null);
            setRecado(texto);
            void carregar();
          }}
        />
      )}
    </>
  );
}

type Dados = {
  name: string;
  priceCents: number;
  description: string;
  features: string[];
  highlighted: boolean;
  active: boolean;
  limits: PlanLimits;
  modules: PlanModules;
};

function EditorPlano({
  plano,
  aoFechar,
  aoSalvar,
}: {
  plano: AdminPlan | null;
  aoFechar: () => void;
  aoSalvar: (recado: string) => void;
}) {
  const [nome, setNome] = useState(plano?.name ?? "");
  const [valor, setValor] = useState(plano ? reais(plano.priceCents) : "");
  const [descricao, setDescricao] = useState(plano?.description ?? "");
  const [itens, setItens] = useState((plano?.features ?? []).join("\n"));
  const [destaque, setDestaque] = useState(plano?.highlighted ?? false);
  const [ativo, setAtivo] = useState(plano?.active ?? true);
  const [limites, setLimites] = useState<Record<PlanResource, string>>({
    tables: plano?.limits.tables?.toString() ?? "",
    members: plano?.limits.members?.toString() ?? "",
    products: plano?.limits.products?.toString() ?? "",
  });
  const [modulos, setModulos] = useState<PlanModules>(plano?.modules ?? { tabs: true, stock: true, storefront: true });
  const [erros, setErros] = useState<
    { name?: string; priceCents?: string; features?: string } & Partial<Record<PlanResource, string>>
  >({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Valor mudou num plano com clientes: pergunta antes de salvar.
  const [perguntar, setPerguntar] = useState<Dados | null>(null);

  function montar(): Dados | null {
    const priceCents = parseMoney(valor);
    const features = itens
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const novos = {
      name: nome.trim().length < 2 ? "Informe o nome do plano" : undefined,
      priceCents: !priceCents || priceCents < 1 ? "Valor inválido. Use, por exemplo, 99,90" : undefined,
      features:
        features.length > 12
          ? "No máximo 12 itens"
          : features.some((f) => f.length > 80)
            ? "Cada item com no máximo 80 caracteres"
            : undefined,
      tables:
        lerLimite(limites.tables) === undefined || (lerLimite(limites.tables) ?? 0) > 999
          ? "Número de 1 a 999, ou vazio"
          : undefined,
      members: lerLimite(limites.members) === undefined ? "Número a partir de 1, ou vazio" : undefined,
      products: lerLimite(limites.products) === undefined ? "Número a partir de 1, ou vazio" : undefined,
    };
    setErros(novos);
    if (Object.values(novos).some(Boolean)) return null;
    return {
      name: nome.trim(),
      priceCents: priceCents!,
      description: descricao.trim(),
      features,
      highlighted: destaque,
      active: ativo,
      limits: {
        tables: lerLimite(limites.tables)!,
        members: lerLimite(limites.members)!,
        products: lerLimite(limites.products)!,
      } as PlanLimits,
      modules: modulos,
    };
  }

  async function enviar(dados: Dados, aplicarATodos: boolean) {
    setEnviando(true);
    setErro(null);
    try {
      const r = planSavedSchema.parse(
        await pedir(
          plano ? `/admin/plans/${plano.id}` : "/admin/plans",
          corpo(plano ? "PUT" : "POST", { ...dados, applyPriceToSubscribers: aplicarATodos }),
        ),
      );
      aoSalvar(
        r.updatedSubscriptions > 0
          ? `Plano salvo. ${r.updatedSubscriptions} ${r.updatedSubscriptions === 1 ? "restaurante passa" : "restaurantes passam"} a pagar ${formatMoney(dados.priceCents)} a partir da próxima fatura.`
          : "Plano salvo. O site já mostra a mudança.",
      );
    } catch (falha) {
      setPerguntar(null);
      setErro(mensagem(falha, "Não foi possível salvar o plano."));
      setEnviando(false);
    }
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    const dados = montar();
    if (!dados) return;
    if (plano && plano.subscribers > 0 && dados.priceCents !== plano.priceCents) {
      setPerguntar(dados);
      return;
    }
    void enviar(dados, false);
  }

  if (perguntar && plano) {
    return (
      <Dialogo aberto aoFechar={() => setPerguntar(null)} titulo="O valor novo vale para quem?">
        <div className="admin-form">
          <p>
            O {plano.name} passa de {formatMoney(plano.priceCents)} para{" "}
            <strong>{formatMoney(perguntar.priceCents)}</strong>.{" "}
            {plano.subscribers === 1 ? "1 restaurante já está" : `${plano.subscribers} restaurantes já estão`} neste
            plano.
          </p>
          <p className="suave">Faturas já geradas não mudam em nenhum dos casos.</p>
          <div className="plano-escolha">
            <Botao
              variante="contorno"
              largo
              carregando={enviando}
              textoCarregando="Salvando..."
              onClick={() => void enviar(perguntar, false)}
            >
              Só para clientes novos
            </Botao>
            <Botao
              largo
              carregando={enviando}
              textoCarregando="Salvando..."
              onClick={() => void enviar(perguntar, true)}
            >
              Aplicar {plano.subscribers === 1 ? "ao restaurante" : `aos ${plano.subscribers} restaurantes`}
            </Botao>
          </div>
          <Botao variante="claro" onClick={() => setPerguntar(null)} disabled={enviando}>
            Voltar e editar
          </Botao>
        </div>
      </Dialogo>
    );
  }

  return (
    <Dialogo aberto largo aoFechar={aoFechar} titulo={plano ? `Editar ${plano.name}` : "Novo plano"}>
      <form onSubmit={salvar} noValidate className="admin-form">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo
          rotulo="Nome do plano"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          erro={erros.name}
          maxLength={40}
          autoFocus
        />
        <Campo
          rotulo="Valor por mês (R$)"
          inputMode="decimal"
          placeholder="99,90"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          erro={erros.priceCents}
        />
        <CampoArea
          rotulo="Descrição curta (opcional)"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Para quem é este plano"
        />
        <CampoArea
          rotulo="Itens do plano"
          value={itens}
          onChange={(e) => setItens(e.target.value)}
          rows={5}
          erro={erros.features}
          ajuda="Um por linha. Aparecem como lista no site."
          placeholder={"Mesas e comandas\nEstoque com ficha técnica\nEquipe sem limite"}
        />
        <fieldset className="plano-limites">
          <legend>Limites</legend>
          <p className="suave">Vazio = sem limite. Pacotes à parte somam a estes números.</p>
          <div className="plano-limites-campos">
            <Campo
              rotulo="Até a mesa"
              inputMode="numeric"
              placeholder="sem limite"
              value={limites.tables}
              onChange={(e) => setLimites((l) => ({ ...l, tables: e.target.value.replace(/\D/g, "") }))}
              erro={erros.tables}
            />
            <Campo
              rotulo="Pessoas na equipe"
              inputMode="numeric"
              placeholder="sem limite"
              value={limites.members}
              onChange={(e) => setLimites((l) => ({ ...l, members: e.target.value.replace(/\D/g, "") }))}
              erro={erros.members}
              ajuda="Contando o dono."
            />
            <Campo
              rotulo="Produtos no cardápio"
              inputMode="numeric"
              placeholder="sem limite"
              value={limites.products}
              onChange={(e) => setLimites((l) => ({ ...l, products: e.target.value.replace(/\D/g, "") }))}
              erro={erros.products}
            />
          </div>
        </fieldset>
        <fieldset className="plano-limites">
          <legend>O que o plano inclui</legend>
          {PLAN_MODULES.map((m) => (
            <Marcador
              key={m}
              rotulo={PLAN_MODULE_LABELS[m]}
              checked={modulos[m]}
              onChange={(e) => setModulos((x) => ({ ...x, [m]: e.target.checked }))}
            />
          ))}
          <p className="suave">
            Desmarcado, a parte some do painel do restaurante e o sistema recusa o uso. Nada é apagado.
          </p>
        </fieldset>
        <Marcador
          rotulo="Destaque no site"
          checked={destaque}
          onChange={(e) => setDestaque(e.target.checked)}
          ajuda="Só um plano fica em destaque: marcar este tira o destaque do outro."
        />
        <Marcador
          rotulo="Mostrar no site"
          checked={ativo}
          onChange={(e) => setAtivo(e.target.checked)}
          ajuda="Desmarcado, o plano some do site e da escolha na Cobrança. Quem já está nele continua igual."
        />
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

/** Produtos à parte: pacotes que aumentam um limite, vendidos junto do plano na Cobrança. */
function Adicionais() {
  const [lista, setLista] = useState<AdminPlanAddon[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [editando, setEditando] = useState<AdminPlanAddon | "novo" | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(adminPlanAddonSchema.array().parse(await pedir("/admin/addons")));
      setErro(null);
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível carregar os adicionais."));
    }
  }, []);

  useEffect(() => void carregar(), [carregar]);

  return (
    <section className="adicionais" aria-label="Produtos à parte">
      <div className="cab">
        <div>
          <h2>Produtos à parte</h2>
          <p className="suave" style={{ marginTop: 6 }}>
            Pacotes que aumentam um limite do plano. Você coloca no restaurante em Cobrança; o valor entra na fatura do
            mês.
          </p>
        </div>
        <div className="direita">
          <Botao variante="contorno" icone="mais" onClick={() => setEditando("novo")}>
            Novo adicional
          </Botao>
        </div>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {recado && (
        <p role="status" className="cobranca-recado">
          {recado}
        </p>
      )}
      {lista?.length === 0 && <p className="suave">Nenhum adicional ainda.</p>}
      {lista && lista.length > 0 && (
        <ul className="admin-lista">
          {lista.map((a) => (
            <li key={a.id} data-bloqueado={a.active ? undefined : ""}>
              <div className="admin-nome">
                <strong>{a.name}</strong>
                <span className="suave">
                  +{a.amount}{" "}
                  {a.amount === 1 ? PLAN_RESOURCE_LABELS[a.resource].singular : PLAN_RESOURCE_LABELS[a.resource].plural}{" "}
                  por pacote
                </span>
              </div>
              <div className="admin-uso">
                <span>
                  <strong className="num">{formatMoney(a.priceCents)}</strong> por mês
                </span>
                <span className="suave">
                  {a.subscribers === 0
                    ? "Nenhum restaurante"
                    : `${a.subscribers} ${a.subscribers === 1 ? "restaurante" : "restaurantes"}`}
                  {a.subscribersWithOtherPrice > 0 && `, ${a.subscribersWithOtherPrice} com outro valor`}
                </span>
              </div>
              <div className="admin-acoes">
                {!a.active && <Etiqueta tom="neutra">Fora do site</Etiqueta>}
                <Botao variante="contorno" pequeno icone="lapis" onClick={() => setEditando(a)}>
                  Editar
                </Botao>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editando && (
        <EditorAdicional
          adicional={editando === "novo" ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={(texto) => {
            setEditando(null);
            setRecado(texto);
            void carregar();
          }}
        />
      )}
    </section>
  );
}

type DadosAdicional = { name: string; resource: PlanResource; amount: number; priceCents: number; active: boolean };

function EditorAdicional({
  adicional,
  aoFechar,
  aoSalvar,
}: {
  adicional: AdminPlanAddon | null;
  aoFechar: () => void;
  aoSalvar: (recado: string) => void;
}) {
  const [nome, setNome] = useState(adicional?.name ?? "");
  const [recurso, setRecurso] = useState<PlanResource>(adicional?.resource ?? "tables");
  const [quanto, setQuanto] = useState(String(adicional?.amount ?? 10));
  const [valor, setValor] = useState(adicional ? reais(adicional.priceCents) : "");
  const [ativo, setAtivo] = useState(adicional?.active ?? true);
  const [erros, setErros] = useState<{ name?: string; amount?: string; priceCents?: string }>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [perguntar, setPerguntar] = useState<DadosAdicional | null>(null);

  async function enviar(dados: DadosAdicional, aplicarATodos: boolean) {
    setEnviando(true);
    setErro(null);
    try {
      const r = planAddonSavedSchema.parse(
        await pedir(
          adicional ? `/admin/addons/${adicional.id}` : "/admin/addons",
          corpo(adicional ? "PUT" : "POST", { ...dados, applyPriceToSubscribers: aplicarATodos }),
        ),
      );
      aoSalvar(
        r.updatedSubscriptions > 0
          ? `Adicional salvo. ${r.updatedSubscriptions} ${r.updatedSubscriptions === 1 ? "restaurante passa" : "restaurantes passam"} a pagar ${formatMoney(dados.priceCents)} por pacote.`
          : "Adicional salvo.",
      );
    } catch (falha) {
      setPerguntar(null);
      setErro(mensagem(falha, "Não foi possível salvar o adicional."));
      setEnviando(false);
    }
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    const priceCents = parseMoney(valor);
    const amount = /^\d{1,3}$/.test(quanto) ? Number(quanto) : 0;
    const novos = {
      name: nome.trim().length < 2 ? "Informe o nome" : undefined,
      amount: amount < 1 ? "Quanto cada pacote aumenta (1 a 999)" : undefined,
      priceCents: !priceCents || priceCents < 1 ? "Valor inválido. Use, por exemplo, 30,00" : undefined,
    };
    setErros(novos);
    if (novos.name || novos.amount || novos.priceCents) return;
    const dados = { name: nome.trim(), resource: recurso, amount, priceCents: priceCents!, active: ativo };
    if (adicional && adicional.subscribers > 0 && dados.priceCents !== adicional.priceCents) {
      setPerguntar(dados);
      return;
    }
    void enviar(dados, false);
  }

  if (perguntar && adicional) {
    return (
      <Dialogo aberto aoFechar={() => setPerguntar(null)} titulo="O valor novo vale para quem?">
        <div className="admin-form">
          <p>
            {adicional.name} passa de {formatMoney(adicional.priceCents)} para{" "}
            <strong>{formatMoney(perguntar.priceCents)}</strong> por pacote.{" "}
            {adicional.subscribers === 1 ? "1 restaurante já tem" : `${adicional.subscribers} restaurantes já têm`} este
            adicional.
          </p>
          <p className="suave">Faturas já geradas não mudam em nenhum dos casos.</p>
          <div className="plano-escolha">
            <Botao
              variante="contorno"
              largo
              carregando={enviando}
              textoCarregando="Salvando..."
              onClick={() => void enviar(perguntar, false)}
            >
              Só para quem contratar depois
            </Botao>
            <Botao
              largo
              carregando={enviando}
              textoCarregando="Salvando..."
              onClick={() => void enviar(perguntar, true)}
            >
              Aplicar {adicional.subscribers === 1 ? "ao restaurante" : `aos ${adicional.subscribers} restaurantes`}
            </Botao>
          </div>
          <Botao variante="claro" onClick={() => setPerguntar(null)} disabled={enviando}>
            Voltar e editar
          </Botao>
        </div>
      </Dialogo>
    );
  }

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={adicional ? `Editar ${adicional.name}` : "Novo adicional"}>
      <form onSubmit={salvar} noValidate className="admin-form">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo
          rotulo="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          erro={erros.name}
          maxLength={40}
          placeholder="+10 mesas"
          autoFocus
        />
        <div className="plano-limites-campos">
          <Seletor rotulo="O que aumenta" value={recurso} onChange={(e) => setRecurso(e.target.value as PlanResource)}>
            {PLAN_RESOURCES.map((r) => (
              <option key={r} value={r}>
                {PLAN_RESOURCE_LABELS[r].plural[0]!.toUpperCase() + PLAN_RESOURCE_LABELS[r].plural.slice(1)}
              </option>
            ))}
          </Seletor>
          <Campo
            rotulo="Quanto cada pacote aumenta"
            inputMode="numeric"
            value={quanto}
            onChange={(e) => setQuanto(e.target.value.replace(/\D/g, ""))}
            erro={erros.amount}
          />
          <Campo
            rotulo="Valor por mês (R$)"
            inputMode="decimal"
            placeholder="30,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            erro={erros.priceCents}
          />
        </div>
        <Marcador
          rotulo="Mostrar no site e na Cobrança"
          checked={ativo}
          onChange={(e) => setAtivo(e.target.checked)}
          ajuda="Desmarcado, ninguém novo contrata. Quem já tem continua igual."
        />
        <div className="dialogo-acoes">
          <Botao variante="claro" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao type="submit" carregando={enviando} textoCarregando="Salvando...">
            Salvar adicional
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}
