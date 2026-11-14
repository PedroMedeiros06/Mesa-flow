import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminPlanSchema, formatMoney, parseMoney, planSavedSchema, type AdminPlan } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { sessao } from "@/lib/sessao";
import { Aviso, Botao, Campo, CampoArea, Comanda, Dialogo, Etiqueta, Marcador } from "@/ui/componentes";
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
            Os planos ativos aparecem na página inicial do site, nesta ordem. Os itens são só texto: todo restaurante usa tudo.
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
              <Comanda className={`plano-admin ${p.highlighted ? "plano-admin-destaque" : ""} ${p.active ? "" : "plano-admin-inativo"}`}>
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
                  <Botao variante="claro" pequeno icone="cima" disabled={i === 0 || movendo} onClick={() => void mover(i, -1)} aria-label={`Subir ${p.name}`}>
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
};

function EditorPlano({ plano, aoFechar, aoSalvar }: { plano: AdminPlan | null; aoFechar: () => void; aoSalvar: (recado: string) => void }) {
  const [nome, setNome] = useState(plano?.name ?? "");
  const [valor, setValor] = useState(plano ? reais(plano.priceCents) : "");
  const [descricao, setDescricao] = useState(plano?.description ?? "");
  const [itens, setItens] = useState((plano?.features ?? []).join("\n"));
  const [destaque, setDestaque] = useState(plano?.highlighted ?? false);
  const [ativo, setAtivo] = useState(plano?.active ?? true);
  const [erros, setErros] = useState<{ name?: string; priceCents?: string; features?: string }>({});
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
      features: features.length > 12 ? "No máximo 12 itens" : features.some((f) => f.length > 80) ? "Cada item com no máximo 80 caracteres" : undefined,
    };
    setErros(novos);
    if (novos.name || novos.priceCents || novos.features) return null;
    return { name: nome.trim(), priceCents: priceCents!, description: descricao.trim(), features, highlighted: destaque, active: ativo };
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
            O {plano.name} passa de {formatMoney(plano.priceCents)} para <strong>{formatMoney(perguntar.priceCents)}</strong>.{" "}
            {plano.subscribers === 1 ? "1 restaurante já está" : `${plano.subscribers} restaurantes já estão`} neste plano.
          </p>
          <p className="suave">Faturas já geradas não mudam em nenhum dos casos.</p>
          <div className="plano-escolha">
            <Botao variante="contorno" largo carregando={enviando} textoCarregando="Salvando..." onClick={() => void enviar(perguntar, false)}>
              Só para clientes novos
            </Botao>
            <Botao largo carregando={enviando} textoCarregando="Salvando..." onClick={() => void enviar(perguntar, true)}>
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
    <Dialogo aberto aoFechar={aoFechar} titulo={plano ? `Editar ${plano.name}` : "Novo plano"}>
      <form onSubmit={salvar} noValidate className="admin-form">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo rotulo="Nome do plano" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.name} maxLength={40} autoFocus />
        <Campo rotulo="Valor por mês (R$)" inputMode="decimal" placeholder="99,90" value={valor} onChange={(e) => setValor(e.target.value)} erro={erros.priceCents} />
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
        <Marcador rotulo="Destaque no site" checked={destaque} onChange={(e) => setDestaque(e.target.checked)} ajuda="Só um plano fica em destaque: marcar este tira o destaque do outro." />
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
