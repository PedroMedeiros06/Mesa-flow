import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  adminCompanyCreatedSchema,
  adminCompanyCreateSchema,
  adminCompanySchema,
  passwordLinkSchema,
  type AdminCompany,
} from "@mesaflow/shared";
import { mascaraCpf } from "@/lib/formato";
import { ApiErro } from "@/lib/http";
import { sessao } from "@/lib/sessao";
import { Aviso, Botao, Campo, classeBotao, Dialogo, Etiqueta } from "@/ui/componentes";
import { errosPorCampo, type ErrosCampos } from "../acesso/erros";
import { PedirMotivo } from "../mesas/PedirMotivo";
import { linkDeSenha } from "../equipe/api";
import "./admin.css";

const pedir = async (caminho: string, init?: RequestInit): Promise<unknown> =>
  (await sessao.requisicao("admin", caminho, init)).json();
const corpo = (method: string, dados: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(dados),
});
const mensagem = (falha: unknown, padrao: string) => (falha instanceof ApiErro ? falha.message : padrao);

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });

type Aberto =
  | { tipo: "novo" }
  | { tipo: "link"; empresa: AdminCompany; token: string | null }
  | { tipo: "bloquear"; empresa: AdminCompany }
  | null;

/** /admin/restaurantes: cadastro assistido, bloqueio e link de senha do dono. */
export function Restaurantes() {
  const [lista, setLista] = useState<AdminCompany[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Aberto>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(adminCompanySchema.array().parse(await pedir("/admin/companies")));
      setErro(null);
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível carregar os restaurantes."));
    }
  }, []);

  useEffect(() => void carregar(), [carregar]);

  async function gerarLink(empresa: AdminCompany) {
    setOcupado(empresa.id);
    setErro(null);
    try {
      const { token } = passwordLinkSchema.parse(await pedir(`/admin/companies/${empresa.id}/owner-link`, { method: "POST" }));
      setAberto({ tipo: "link", empresa, token });
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível gerar o link."));
    } finally {
      setOcupado(null);
    }
  }

  async function desbloquear(empresa: AdminCompany) {
    setOcupado(empresa.id);
    setErro(null);
    try {
      await pedir(`/admin/companies/${empresa.id}/status`, corpo("PUT", { status: "active" }));
      await carregar();
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível desbloquear."));
    } finally {
      setOcupado(null);
    }
  }

  const ativos = lista?.filter((c) => c.status === "active").length ?? 0;

  return (
    <>
      <div className="cab">
        <div>
          <h1>Restaurantes</h1>
          {lista && (
            <p className="suave" style={{ marginTop: 6 }}>
              {ativos} {ativos === 1 ? "ativo" : "ativos"}
              {lista.length > ativos && `, ${lista.length - ativos} bloqueado${lista.length - ativos === 1 ? "" : "s"}`}
            </p>
          )}
        </div>
        <div className="direita">
          <Botao icone="mais" onClick={() => setAberto({ tipo: "novo" })}>
            Cadastrar restaurante
          </Botao>
        </div>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {!lista && !erro && <p className="suave">Carregando...</p>}
      {lista?.length === 0 && <p className="suave">Nenhum restaurante ainda. Cadastre o primeiro.</p>}

      {lista && lista.length > 0 && (
        <ul className="admin-lista">
          {lista.map((c) => (
            <li key={c.id} data-bloqueado={c.status === "blocked" ? "" : undefined}>
              <div className="admin-nome">
                <strong>{c.name}</strong>
                <span className="suave">
                  Código {c.code} · desde {data(c.createdAt)}
                </span>
                <span className="suave">{c.owner ? `${c.owner.name} · ${c.owner.email}` : "Sem dono cadastrado"}</span>
                {c.status === "blocked" && c.blockedReason && <span className="admin-motivo">Motivo: {c.blockedReason}</span>}
              </div>
              <div className="admin-uso">
                <span>
                  <strong className="num">{c.ordersLast30Days}</strong> pedidos em 30 dias
                </span>
                <span className="suave">
                  {c.membersCount} na equipe · {c.lastOrderAt ? `último pedido ${data(c.lastOrderAt)}` : "nenhum pedido ainda"}
                </span>
              </div>
              <div className="admin-acoes">
                {c.status === "blocked" ? (
                  <>
                    <Etiqueta tom="brasa" icone="alerta">
                      Bloqueado
                    </Etiqueta>
                    <Botao
                      variante="contorno"
                      pequeno
                      carregando={ocupado === c.id}
                      textoCarregando="Liberando..."
                      onClick={() => void desbloquear(c)}
                    >
                      Desbloquear
                    </Botao>
                  </>
                ) : (
                  <>
                    {c.owner && (
                      <Botao
                        variante="claro"
                        pequeno
                        carregando={ocupado === c.id}
                        textoCarregando="Gerando..."
                        onClick={() => void gerarLink(c)}
                      >
                        Link de senha do dono
                      </Botao>
                    )}
                    <Botao variante="perigo" pequeno onClick={() => setAberto({ tipo: "bloquear", empresa: c })}>
                      Bloquear
                    </Botao>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {aberto?.tipo === "novo" && (
        <NovoRestaurante
          aoFechar={() => setAberto(null)}
          aoCriar={(empresa, token) => {
            void carregar();
            setAberto({ tipo: "link", empresa, token });
          }}
        />
      )}
      {aberto?.tipo === "link" && (
        <LinkDono empresa={aberto.empresa} token={aberto.token} aoGerarDeNovo={() => void gerarLink(aberto.empresa)} aoFechar={() => setAberto(null)} />
      )}
      {aberto?.tipo === "bloquear" && (
        <PedirMotivo
          titulo={`Bloquear ${aberto.empresa.name}`}
          texto="Na hora, a equipe sai do painel e o cardápio online e o QR das mesas param. Nada é apagado: desbloquear volta tudo como estava. O motivo aparece para quem tentar entrar."
          rotuloBotao="Bloquear"
          textoCarregando="Bloqueando..."
          exemplo="Mensalidade em atraso"
          aoFechar={() => setAberto(null)}
          aoConfirmar={async (reason) => {
            await pedir(`/admin/companies/${aberto.empresa.id}/status`, corpo("PUT", { status: "blocked", reason }));
            setAberto(null);
            await carregar();
          }}
        />
      )}
    </>
  );
}

type CampoNovo = "name" | "ownerName" | "ownerCpf" | "ownerEmail";

function NovoRestaurante({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (c: AdminCompany, token: string | null) => void }) {
  const [nome, setNome] = useState("");
  const [dono, setDono] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [erros, setErros] = useState<ErrosCampos<CampoNovo>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const dados = { name: nome, ownerName: dono, ownerCpf: cpf, ownerEmail: email };
    const valido = adminCompanyCreateSchema.safeParse(dados);
    if (!valido.success) {
      setErros(errosPorCampo<CampoNovo>(valido.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))));
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      const r = adminCompanyCreatedSchema.parse(await pedir("/admin/companies", corpo("POST", dados)));
      aoCriar(r.company, r.token);
    } catch (falha) {
      if (falha instanceof ApiErro && falha.issues.length) setErros(errosPorCampo<CampoNovo>(falha.issues));
      setErro(mensagem(falha, "Não foi possível cadastrar. Tente de novo."));
      setEnviando(false);
    }
  }

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo="Cadastrar restaurante">
      <form onSubmit={criar} noValidate className="admin-form">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo rotulo="Nome do restaurante" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.name} maxLength={80} autoFocus />
        <Campo rotulo="Nome do dono" value={dono} onChange={(e) => setDono(e.target.value)} erro={erros.ownerName} maxLength={80} />
        <Campo
          rotulo="CPF do dono"
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={cpf}
          onChange={(e) => setCpf(mascaraCpf(e.target.value))}
          erro={erros.ownerCpf}
        />
        <Campo rotulo="E-mail do dono" type="email" value={email} onChange={(e) => setEmail(e.target.value)} erro={erros.ownerEmail} />
        <p className="suave">O código de acesso é sorteado. Depois de cadastrar, você manda o link para o dono criar a senha.</p>
        <div className="dialogo-acoes">
          <Botao variante="claro" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao type="submit" carregando={enviando} textoCarregando="Cadastrando...">
            Cadastrar e gerar link
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}

function LinkDono({
  empresa,
  token,
  aoGerarDeNovo,
  aoFechar,
}: {
  empresa: AdminCompany;
  token: string | null;
  aoGerarDeNovo: () => void;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const link = token ? linkDeSenha(token) : null;
  const primeiro = empresa.owner?.name.split(" ")[0] ?? "";
  const texto = link
    ? `Olá, ${primeiro}! O ${empresa.name} já está no MesaFlow. Crie a sua senha por este link: ${link}\nDepois entre com o código ${empresa.code} e o seu CPF.`
    : "";

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={`Acesso do dono: ${empresa.name}`}>
      <div className="admin-form">
        <p className="admin-codigo">
          Código do restaurante <strong className="numeral">{empresa.code}</strong>
        </p>
        {!link ? (
          <>
            <Aviso>O restaurante foi cadastrado, mas o link não saiu. Gere de novo.</Aviso>
            <div className="dialogo-acoes">
              <Botao variante="claro" onClick={aoFechar}>
                Fechar
              </Botao>
              <Botao onClick={aoGerarDeNovo}>Gerar link</Botao>
            </div>
          </>
        ) : (
          <>
            <p>Mande para {primeiro || "o dono"}: pelo link ele cria a senha, depois entra com o código acima e o CPF.</p>
            <input className="admin-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link de senha" />
            <p className="suave">O link vale uma vez só e por pouco tempo. Se vencer, gere outro na lista.</p>
            <div className="dialogo-acoes">
              <Botao variante="claro" onClick={aoFechar}>
                Fechar
              </Botao>
              <a className={classeBotao("contorno")} href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
                Enviar pelo WhatsApp
              </a>
              <Botao
                icone={copiado ? "check" : undefined}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(texto)
                    .then(() => setCopiado(true))
                    .catch(() => setCopiado(false))
                }
              >
                {copiado ? "Copiado" : "Copiar mensagem"}
              </Botao>
            </div>
          </>
        )}
      </div>
    </Dialogo>
  );
}
