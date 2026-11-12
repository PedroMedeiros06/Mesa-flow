import {
  memberCreatedSchema,
  memberSchema,
  passwordLinkSchema,
  setPasswordResultSchema,
  type Member,
  type MemberCreated,
  type MemberCreateInput,
  type MemberUpdateInput,
  type SetPasswordInput,
  type SetPasswordResult,
} from "@mesaflow/shared";
import { enviar, erroDaResposta, json } from "@/lib/http";
import { sessao } from "@/lib/sessao";

const corpo = (method: string, dados: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(dados),
});
const pedir = async (caminho: string, init?: RequestInit): Promise<unknown> =>
  (await sessao.requisicao("membro", caminho, init)).json();

export const apiEquipe = {
  async listar(): Promise<Member[]> {
    return memberSchema.array().parse(await pedir("/members"));
  },
  async criar(dados: MemberCreateInput): Promise<MemberCreated> {
    return memberCreatedSchema.parse(await pedir("/members", corpo("POST", dados)));
  },
  async alterar(id: string, dados: MemberUpdateInput): Promise<Member> {
    return memberSchema.parse(await pedir(`/members/${id}`, corpo("PATCH", dados)));
  },
  async linkSenha(id: string): Promise<string> {
    return passwordLinkSchema.parse(await pedir(`/members/${id}/password-link`, { method: "POST" })).token;
  },
};

/** Pública: quem abre o link ainda não tem sessão. */
export async function definirSenha(dados: SetPasswordInput): Promise<SetPasswordResult> {
  const res = await enviar(fetch, "/auth/password", json(dados));
  if (!res.ok) throw await erroDaResposta(res);
  return setPasswordResultSchema.parse(await res.json());
}

export const linkDeSenha = (token: string) => `${window.location.origin}/senha?token=${encodeURIComponent(token)}`;
