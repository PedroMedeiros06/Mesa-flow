import { apiErrorSchema } from "@mesaflow/shared";

export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

/** Erro de uma chamada à API. status 0 = não chegou ao servidor. */
export class ApiErro extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "ApiErro";
  }
}

const MENSAGEM_PADRAO: Record<number, string> = {
  401: "Sua sessão terminou. Entre de novo.",
  403: "Você não tem permissão para esta ação.",
  404: "Não encontrado.",
  429: "Muitas tentativas. Espere um minuto e tente de novo.",
};

/** Converte uma resposta de erro da API (ou a falta dela) em ApiErro. */
export async function erroDaResposta(res: Response): Promise<ApiErro> {
  const corpo: unknown = await res.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(corpo);
  if (parsed.success) return new ApiErro(res.status, parsed.data.message, parsed.data.issues);
  return new ApiErro(res.status, MENSAGEM_PADRAO[res.status] ?? `O servidor respondeu ${res.status}.`);
}

export async function enviar(fetcher: typeof fetch, caminho: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetcher(`${API_URL}${caminho}`, init);
  } catch {
    throw new ApiErro(0, "Não foi possível conectar ao servidor. Confira a internet e tente de novo.");
  }
}

export function json(corpo: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) };
}
