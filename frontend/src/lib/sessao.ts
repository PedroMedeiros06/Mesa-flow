import {
  adminProfileSchema,
  adminSessionSchema,
  memberProfileSchema,
  memberSessionSchema,
  sessionTokensSchema,
  type AdminLoginInput,
  type AdminSession,
  type MemberSession,
  type RestaurantLoginInput,
} from "@mesaflow/shared";
import { ApiErro, enviar, erroDaResposta, json } from "./http";

export type TipoSessao = "membro" | "admin";
export interface Sessoes {
  membro: MemberSession | null;
  admin: AdminSession | null;
}

export interface Armazem {
  ler(chave: string): string | null;
  gravar(chave: string, valor: string): void;
  apagar(chave: string): void;
}

/** localStorage pode não existir ou lançar erro (aba anônima, bloqueio): nesse caso a sessão vive só na memória. */
export const armazemDoNavegador: Armazem = {
  ler: (c) => {
    try {
      return localStorage.getItem(c);
    } catch {
      return null;
    }
  },
  gravar: (c, v) => {
    try {
      localStorage.setItem(c, v);
    } catch {
      // ignora
    }
  },
  apagar: (c) => {
    try {
      localStorage.removeItem(c);
    } catch {
      // ignora
    }
  },
};

const CHAVE: Record<TipoSessao, string> = { membro: "mesaflow:sessao", admin: "mesaflow:sessao-admin" };
const SCHEMA = { membro: memberSessionSchema, admin: adminSessionSchema } as const;
const ROTA = {
  membro: { login: "/auth/login", logout: "/auth/logout", me: "/auth/me" },
  admin: { login: "/admin/auth/login", logout: "/admin/auth/logout", me: "/admin/auth/me" },
} as const;

// Renova o token um pouco antes de vencer, para não mandar requisição com token no limite.
const MARGEM_SEGUNDOS = 30;

interface Opcoes {
  fetcher?: typeof fetch;
  armazem?: Armazem;
  agora?: () => number;
}

export function criarClienteSessao({ fetcher = (...a) => fetch(...a), armazem = armazemDoNavegador, agora = Date.now }: Opcoes = {}) {
  const ler = <T extends TipoSessao>(tipo: T): Sessoes[T] => {
    const bruto = armazem.ler(CHAVE[tipo]);
    if (!bruto) return null;
    try {
      const parsed = SCHEMA[tipo].safeParse(JSON.parse(bruto));
      return parsed.success ? (parsed.data as Sessoes[T]) : null;
    } catch {
      return null;
    }
  };

  let estado: Sessoes = { membro: ler("membro"), admin: ler("admin") };
  const ouvintes = new Set<() => void>();
  const renovando: Partial<Record<TipoSessao, Promise<boolean>>> = {};

  function definir<T extends TipoSessao>(tipo: T, sessao: Sessoes[T]) {
    estado = { ...estado, [tipo]: sessao };
    if (sessao) armazem.gravar(CHAVE[tipo], JSON.stringify(sessao));
    else armazem.apagar(CHAVE[tipo]);
    ouvintes.forEach((o) => o());
  }

  /** Troca os tokens. false = sessão não pode ser renovada (já foi limpa). Erro de rede é repassado. */
  function renovar(tipo: TipoSessao): Promise<boolean> {
    renovando[tipo] ??= (async () => {
      const atual = estado[tipo];
      if (!atual) return false;
      const res = await enviar(fetcher, "/auth/refresh", json({ refreshToken: atual.refreshToken }));
      if (!res.ok) {
        if (res.status === 400 || res.status === 401) {
          definir(tipo, null);
          return false;
        }
        throw await erroDaResposta(res);
      }
      const tokens = sessionTokensSchema.parse(await res.json());
      const depois = estado[tipo];
      if (depois) definir(tipo, { ...depois, ...tokens });
      return true;
    })().finally(() => {
      delete renovando[tipo];
    });
    return renovando[tipo];
  }

  async function login<T extends TipoSessao>(tipo: T, corpo: unknown): Promise<NonNullable<Sessoes[T]>> {
    const res = await enviar(fetcher, ROTA[tipo].login, json(corpo));
    if (!res.ok) throw await erroDaResposta(res);
    const sessao = SCHEMA[tipo].parse(await res.json()) as NonNullable<Sessoes[T]>;
    definir(tipo, sessao);
    return sessao;
  }

  /** Requisição autenticada: renova o token quando vence e tenta de novo uma vez após 401. */
  async function requisicao(tipo: TipoSessao, caminho: string, init: RequestInit = {}): Promise<Response> {
    const tentar = async () => {
      const sessao = estado[tipo];
      if (!sessao) throw new ApiErro(401, "Sua sessão terminou. Entre de novo.");
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${sessao.accessToken}`);
      return enviar(fetcher, caminho, { ...init, headers });
    };

    const sessao = estado[tipo];
    if (sessao && sessao.expiresAt - MARGEM_SEGUNDOS <= agora() / 1000) await renovar(tipo);

    let res = await tentar();
    if (res.status === 401 && (await renovar(tipo))) res = await tentar();
    if (res.status === 401) definir(tipo, null);
    if (!res.ok) throw await erroDaResposta(res);
    return res;
  }

  return {
    estado: () => estado,
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    entrarRestaurante: (dados: RestaurantLoginInput) => login("membro", dados),
    entrarAdmin: (dados: AdminLoginInput) => login("admin", dados),
    requisicao,

    /** Relê o perfil no servidor: permissões e bloqueio mudam sem precisar entrar de novo. */
    async atualizarPerfil(tipo: TipoSessao): Promise<void> {
      let res: Response;
      try {
        res = await requisicao(tipo, ROTA[tipo].me);
      } catch (erro) {
        // 403 = restaurante ou pessoa bloqueada: a sessão não vale mais.
        if (erro instanceof ApiErro && erro.status === 403) definir(tipo, null);
        throw erro;
      }
      const corpo: unknown = await res.json();
      const atual = estado[tipo];
      if (!atual) return;
      if (tipo === "membro") {
        definir("membro", { ...(atual as MemberSession), profile: memberProfileSchema.parse(corpo) });
      } else {
        definir("admin", { ...(atual as AdminSession), profile: adminProfileSchema.parse(corpo) });
      }
    },

    async sair(tipo: TipoSessao): Promise<void> {
      if (estado[tipo]) await requisicao(tipo, ROTA[tipo].logout, { method: "POST" }).catch(() => undefined);
      definir(tipo, null);
    },
  };
}

export type ClienteSessao = ReturnType<typeof criarClienteSessao>;

export const sessao = criarClienteSessao();
