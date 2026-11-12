import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  can,
  memberCreateSchema,
  PERMISSION_KEYS,
  PERMISSIONS,
  type Member,
  type MemberProfile,
  type Permission,
} from "@mesaflow/shared";
import { mascaraCpf } from "@/lib/formato";
import { ApiErro } from "@/lib/http";
import { useSessao } from "@/lib/useSessao";
import { Aviso, Botao, Campo, classeBotao, Dialogo, Etiqueta, Marcador } from "@/ui/componentes";
import { errosPorCampo, type ErrosCampos } from "../acesso/erros";
import { apiEquipe, linkDeSenha } from "./api";
import "./equipe.css";

const mensagem = (falha: unknown, padrao: string) => (falha instanceof ApiErro ? falha.message : padrao);

/** Permissões agrupadas na ordem da lista oficial (Pedidos, Mesas, Cardápio...). */
const GRUPOS = PERMISSION_KEYS.reduce<{ nome: string; chaves: Permission[] }[]>((grupos, chave) => {
  const nome = PERMISSIONS[chave].group;
  const grupo = grupos.find((g) => g.nome === nome);
  if (grupo) grupo.chaves.push(chave);
  else grupos.push({ nome, chaves: [chave] });
  return grupos;
}, []);

function resumo(m: Member): string {
  if (m.role === "owner") return "Dono: pode tudo";
  if (m.permissions.length === 0) return "Sem nenhuma permissão";
  return m.permissions.map((p) => PERMISSIONS[p].label).join(" · ");
}

type Aberto = { tipo: "editor"; pessoa: Member | null } | { tipo: "link"; pessoa: Member; token: string | null } | null;

/** Tela /app/equipe: quem trabalha no restaurante, o que cada um pode fazer e o link para criar a senha. */
export function Equipe() {
  const eu = useSessao("membro")?.profile;
  const [lista, setLista] = useState<Member[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Aberto>(null);
  const [gerando, setGerando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(await apiEquipe.listar());
      setErro(null);
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível carregar a equipe."));
    }
  }, []);

  useEffect(() => void carregar(), [carregar]);

  async function gerarLink(pessoa: Member) {
    setGerando(pessoa.id);
    setErro(null);
    try {
      setAberto({ tipo: "link", pessoa, token: await apiEquipe.linkSenha(pessoa.id) });
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível gerar o link. Tente de novo."));
    } finally {
      setGerando(null);
    }
  }

  if (!eu) return null;

  return (
    <>
      <div className="cab">
        <div>
          <h1>Equipe</h1>
          {lista && (
            <p className="suave" style={{ marginTop: 6 }}>
              {lista.length} {lista.length === 1 ? "pessoa" : "pessoas"}. Cada uma entra com o código do restaurante, o
              próprio CPF e a própria senha.
            </p>
          )}
        </div>
        <div className="direita">
          <Botao icone="mais" onClick={() => setAberto({ tipo: "editor", pessoa: null })}>
            Adicionar pessoa
          </Botao>
        </div>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {!lista && !erro && <p className="suave">Carregando a equipe...</p>}

      {lista && (
        <ul className="equipe-lista">
          {lista.map((m) => {
            const souEu = m.id === eu.member.id;
            // Mesma regra da API: quem tem menos permissões não mexe em quem tem mais.
            const editavel =
              m.role !== "owner" && !souEu && m.permissions.every((p) => can(eu.member.role, eu.member.permissions, p));
            return (
              <li key={m.id} data-bloqueado={m.status === "blocked" ? "" : undefined}>
                <div className="equipe-nome">
                  <strong>
                    {m.name}
                    {souEu && <span className="suave"> (você)</span>}
                  </strong>
                  <span className="suave">
                    CPF {mascaraCpf(m.cpf)} · {m.email}
                  </span>
                  <span className="equipe-permissoes">{resumo(m)}</span>
                </div>
                <div className="equipe-status">
                  {m.role === "owner" && (
                    <Etiqueta tom="laranja" icone="cadeado">
                      Dono
                    </Etiqueta>
                  )}
                  {m.status === "blocked" && (
                    <Etiqueta tom="brasa" icone="alerta">
                      Bloqueado
                    </Etiqueta>
                  )}
                </div>
                <div className="equipe-acoes">
                  {(editavel || souEu) && m.status === "active" && (
                    <Botao
                      variante="claro"
                      pequeno
                      carregando={gerando === m.id}
                      textoCarregando="Gerando..."
                      onClick={() => void gerarLink(m)}
                    >
                      Link de senha
                    </Botao>
                  )}
                  {editavel && (
                    <Botao variante="contorno" pequeno icone="lapis" onClick={() => setAberto({ tipo: "editor", pessoa: m })}>
                      Editar
                    </Botao>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {aberto?.tipo === "editor" && (
        <EditorPessoa
          eu={eu}
          pessoa={aberto.pessoa}
          aoFechar={() => setAberto(null)}
          aoSalvar={(pessoa, token) => {
            void carregar();
            setAberto(token !== undefined ? { tipo: "link", pessoa, token } : null);
          }}
        />
      )}
      {aberto?.tipo === "link" && (
        <LinkSenha
          pessoa={aberto.pessoa}
          token={aberto.token}
          aoGerarDeNovo={() => void gerarLink(aberto.pessoa)}
          aoFechar={() => setAberto(null)}
        />
      )}
    </>
  );
}

type CampoPessoa = "name" | "cpf" | "email";

function EditorPessoa({
  eu,
  pessoa,
  aoFechar,
  aoSalvar,
}: {
  eu: MemberProfile;
  pessoa: Member | null;
  aoFechar: () => void;
  /** token só vem no cadastro (null quando o link falhou). */
  aoSalvar: (pessoa: Member, token?: string | null) => void;
}) {
  const [nome, setNome] = useState(pessoa?.name ?? "");
  const [cpf, setCpf] = useState(pessoa ? mascaraCpf(pessoa.cpf) : "");
  const [email, setEmail] = useState(pessoa?.email ?? "");
  const [permissoes, setPermissoes] = useState<Permission[]>(pessoa?.permissions ?? []);
  const [erros, setErros] = useState<ErrosCampos<CampoPessoa>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"salvar" | "bloqueio" | null>(null);

  // Só dá para dar ou tirar o que você mesmo pode fazer.
  const possoMexer = (p: Permission) => can(eu.member.role, eu.member.permissions, p);
  const alternar = (p: Permission) =>
    setPermissoes((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!pessoa) {
      const dados = { name: nome, cpf, email, permissions: permissoes };
      const valido = memberCreateSchema.safeParse(dados);
      if (!valido.success) {
        setErros(errosPorCampo<CampoPessoa>(valido.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))));
        return;
      }
    } else if (nome.trim().length < 2) {
      setErros({ name: "Informe o nome" });
      return;
    }
    setErros({});
    setEnviando("salvar");
    try {
      if (pessoa) {
        aoSalvar(await apiEquipe.alterar(pessoa.id, { name: nome, permissions: permissoes }));
      } else {
        const r = await apiEquipe.criar({ name: nome, cpf, email, permissions: permissoes });
        aoSalvar(r.member, r.token);
      }
    } catch (falha) {
      if (falha instanceof ApiErro && falha.issues.length) setErros(errosPorCampo<CampoPessoa>(falha.issues));
      setErro(mensagem(falha, "Não foi possível salvar. Tente de novo."));
      setEnviando(null);
    }
  }

  async function bloqueio() {
    if (!pessoa) return;
    setErro(null);
    setEnviando("bloqueio");
    try {
      aoSalvar(await apiEquipe.alterar(pessoa.id, { status: pessoa.status === "active" ? "blocked" : "active" }));
    } catch (falha) {
      setErro(mensagem(falha, "Não foi possível alterar. Tente de novo."));
      setEnviando(null);
    }
  }

  return (
    <Dialogo aberto largo aoFechar={aoFechar} titulo={pessoa ? `Editar ${pessoa.name}` : "Adicionar pessoa"}>
      <form onSubmit={salvar} noValidate className="equipe-form">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.name} maxLength={80} autoFocus />
        <div className="equipe-campos">
          <Campo
            rotulo="CPF"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(mascaraCpf(e.target.value))}
            erro={erros.cpf}
            disabled={!!pessoa}
            ajuda={pessoa ? undefined : "É com ele que a pessoa entra no painel."}
          />
          <Campo
            rotulo="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            erro={erros.email}
            disabled={!!pessoa}
            maxLength={254}
          />
        </div>

        <fieldset className="equipe-grupos">
          <legend>O que esta pessoa pode fazer</legend>
          {GRUPOS.map((g) => (
            <div key={g.nome} className="equipe-grupo">
              <h3>{g.nome}</h3>
              {g.chaves.map((p) => (
                <Marcador
                  key={p}
                  rotulo={PERMISSIONS[p].label}
                  checked={permissoes.includes(p)}
                  onChange={() => alternar(p)}
                  disabled={!possoMexer(p)}
                  ajuda={possoMexer(p) ? undefined : "Só quem tem esta permissão pode dar ou tirar."}
                />
              ))}
            </div>
          ))}
        </fieldset>

        <div className="dialogo-acoes">
          {pessoa && (
            <Botao
              variante={pessoa.status === "active" ? "perigo" : "contorno"}
              carregando={enviando === "bloqueio"}
              textoCarregando="Salvando..."
              disabled={enviando !== null}
              onClick={() => void bloqueio()}
              className="equipe-bloquear"
            >
              {pessoa.status === "active" ? "Bloquear acesso" : "Desbloquear"}
            </Botao>
          )}
          <Botao variante="claro" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao type="submit" carregando={enviando === "salvar"} textoCarregando="Salvando..." disabled={enviando !== null}>
            {pessoa ? "Salvar" : "Adicionar e gerar link"}
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}

function LinkSenha({
  pessoa,
  token,
  aoGerarDeNovo,
  aoFechar,
}: {
  pessoa: Member;
  token: string | null;
  aoGerarDeNovo: () => void;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const link = token ? linkDeSenha(token) : null;
  const texto = link ? `Olá, ${pessoa.name.split(" ")[0]}! Crie a sua senha do MesaFlow por este link: ${link}` : "";

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={`Link de senha de ${pessoa.name}`}>
      <div className="equipe-form">
        {!link ? (
          <>
            <Aviso>A pessoa foi adicionada, mas o link não saiu. Tente gerar de novo.</Aviso>
            <div className="dialogo-acoes">
              <Botao variante="claro" onClick={aoFechar}>
                Fechar
              </Botao>
              <Botao onClick={aoGerarDeNovo}>Gerar link</Botao>
            </div>
          </>
        ) : (
          <>
            <p>
              Mande este link para {pessoa.name.split(" ")[0]}. Pelo link, a pessoa cria a própria senha e depois entra com
              o código do restaurante e o CPF.
            </p>
            <input className="equipe-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link de senha" />
            <p className="suave">
              O link vale uma vez só e por pouco tempo. Se vencer ou a pessoa esquecer a senha de novo, gere outro aqui.
            </p>
            <div className="dialogo-acoes">
              <Botao variante="claro" onClick={aoFechar}>
                Fechar
              </Botao>
              <a
                className={classeBotao("contorno")}
                href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
                target="_blank"
                rel="noreferrer"
              >
                Enviar pelo WhatsApp
              </a>
              <Botao icone={copiado ? "check" : undefined} onClick={() => void copiar()}>
                {copiado ? "Copiado" : "Copiar link"}
              </Botao>
            </div>
          </>
        )}
      </div>
    </Dialogo>
  );
}
