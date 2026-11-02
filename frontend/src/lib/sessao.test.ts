import { describe, expect, it } from "vitest";
import type { MemberSession } from "@mesaflow/shared";
import { ApiErro } from "./http";
import { criarClienteSessao, type Armazem } from "./sessao";

const AGORA = 1_800_000_000; // segundos

function sessaoMembro(token = "a1", expiresAt = AGORA + 3600): MemberSession {
  return {
    accessToken: token,
    refreshToken: `r-${token}`,
    expiresAt,
    profile: {
      kind: "member",
      member: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Marina",
        email: "marina@teste.com",
        role: "owner",
        permissions: [],
      },
      company: { id: "22222222-2222-4222-8222-222222222222", code: "482915", name: "Cantina da Vila" },
    },
  };
}

function armazemMemoria(inicial: Record<string, string> = {}): Armazem & { dados: Record<string, string> } {
  const dados = { ...inicial };
  return {
    dados,
    ler: (c) => dados[c] ?? null,
    gravar: (c, v) => {
      dados[c] = v;
    },
    apagar: (c) => {
      delete dados[c];
    },
  };
}

type Rota = (init: RequestInit) => Response | Promise<Response>;
function servidor(rotas: Record<string, Rota>) {
  const chamadas: { url: string; auth: string | null }[] = [];
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    const caminho = url.replace(/^\/api/, "");
    chamadas.push({ url: caminho, auth: new Headers(init.headers).get("Authorization") });
    const rota = rotas[caminho];
    if (!rota) return Response.json({ statusCode: 404, message: "Não encontrado." }, { status: 404 });
    return rota(init);
  }) as typeof fetch;
  return { fetcher, chamadas };
}

const agora = () => AGORA * 1000;

describe("sessão do restaurante", () => {
  it("login grava a sessão e avisa quem está ouvindo", async () => {
    const armazem = armazemMemoria();
    const { fetcher } = servidor({ "/auth/login": () => Response.json(sessaoMembro()) });
    const cliente = criarClienteSessao({ fetcher, armazem, agora });
    let avisos = 0;
    cliente.assinar(() => avisos++);

    await cliente.entrarRestaurante({ companyCode: "482915", cpf: "12345678901", password: "x" });

    expect(cliente.estado().membro?.profile.company.name).toBe("Cantina da Vila");
    expect(armazem.dados["mesaflow:sessao"]).toBeDefined();
    expect(avisos).toBe(1);
  });

  it("login recusado vira ApiErro com a mensagem do servidor", async () => {
    const { fetcher } = servidor({
      "/auth/login": () =>
        Response.json({ statusCode: 401, message: "Código, CPF ou senha incorretos." }, { status: 401 }),
    });
    const cliente = criarClienteSessao({ fetcher, armazem: armazemMemoria(), agora });

    const erro = await cliente.entrarRestaurante({ companyCode: "1", cpf: "1", password: "x" }).catch((e) => e);
    expect(erro).toBeInstanceOf(ApiErro);
    expect(erro.message).toBe("Código, CPF ou senha incorretos.");
    expect(cliente.estado().membro).toBeNull();
  });

  it("ignora sessão salva corrompida", () => {
    const armazem = armazemMemoria({ "mesaflow:sessao": "{nada disso" });
    const cliente = criarClienteSessao({ fetcher: servidor({}).fetcher, armazem, agora });
    expect(cliente.estado().membro).toBeNull();
  });

  it("renova o token vencido antes da requisição", async () => {
    const armazem = armazemMemoria({ "mesaflow:sessao": JSON.stringify(sessaoMembro("velho", AGORA - 10)) });
    const { fetcher, chamadas } = servidor({
      "/auth/refresh": () => Response.json({ accessToken: "novo", refreshToken: "r-novo", expiresAt: AGORA + 3600 }),
      "/teste": () => Response.json({ ok: true }),
    });
    const cliente = criarClienteSessao({ fetcher, armazem, agora });

    await cliente.requisicao("membro", "/teste");

    expect(chamadas.map((c) => c.url)).toEqual(["/auth/refresh", "/teste"]);
    expect(chamadas[1]!.auth).toBe("Bearer novo");
    expect(cliente.estado().membro?.profile.member.name).toBe("Marina");
  });

  it("após 401 renova uma vez e repete a requisição", async () => {
    const armazem = armazemMemoria({ "mesaflow:sessao": JSON.stringify(sessaoMembro("a1")) });
    const { fetcher, chamadas } = servidor({
      "/auth/refresh": () => Response.json({ accessToken: "a2", refreshToken: "r-a2", expiresAt: AGORA + 3600 }),
      "/teste": (init) =>
        new Headers(init.headers).get("Authorization") === "Bearer a2"
          ? Response.json({ ok: true })
          : Response.json({ statusCode: 401, message: "x" }, { status: 401 }),
    });
    const cliente = criarClienteSessao({ fetcher, armazem, agora });

    const res = await cliente.requisicao("membro", "/teste");
    expect(res.ok).toBe(true);
    expect(chamadas.map((c) => c.url)).toEqual(["/teste", "/auth/refresh", "/teste"]);
  });

  it("refresh recusado encerra a sessão", async () => {
    const armazem = armazemMemoria({ "mesaflow:sessao": JSON.stringify(sessaoMembro("a1", AGORA - 10)) });
    const { fetcher } = servidor({
      "/auth/refresh": () => Response.json({ statusCode: 401, message: "x" }, { status: 401 }),
    });
    const cliente = criarClienteSessao({ fetcher, armazem, agora });

    const erro = await cliente.requisicao("membro", "/teste").catch((e) => e);
    expect(erro).toBeInstanceOf(ApiErro);
    expect(erro.status).toBe(401);
    expect(cliente.estado().membro).toBeNull();
    expect(armazem.dados["mesaflow:sessao"]).toBeUndefined();
  });

  it("duas requisições ao mesmo tempo fazem um refresh só", async () => {
    const armazem = armazemMemoria({ "mesaflow:sessao": JSON.stringify(sessaoMembro("velho", AGORA - 10)) });
    const { fetcher, chamadas } = servidor({
      "/auth/refresh": () => Response.json({ accessToken: "novo", refreshToken: "r-novo", expiresAt: AGORA + 3600 }),
      "/teste": () => Response.json({ ok: true }),
    });
    const cliente = criarClienteSessao({ fetcher, armazem, agora });

    await Promise.all([cliente.requisicao("membro", "/teste"), cliente.requisicao("membro", "/teste")]);
    expect(chamadas.filter((c) => c.url === "/auth/refresh")).toHaveLength(1);
  });

  it("perfil com 403 (restaurante bloqueado) encerra a sessão", async () => {
    const armazem = armazemMemoria({ "mesaflow:sessao": JSON.stringify(sessaoMembro()) });
    const { fetcher } = servidor({
      "/auth/me": () =>
        Response.json({ statusCode: 403, message: "Restaurante bloqueado: falta de pagamento" }, { status: 403 }),
    });
    const cliente = criarClienteSessao({ fetcher, armazem, agora });

    const erro = await cliente.atualizarPerfil("membro").catch((e) => e);
    expect(erro.message).toContain("bloqueado");
    expect(cliente.estado().membro).toBeNull();
  });

  it("sair limpa a sessão mesmo sem resposta do servidor", async () => {
    const armazem = armazemMemoria({ "mesaflow:sessao": JSON.stringify(sessaoMembro()) });
    const fetcher = (async () => {
      throw new TypeError("rede caiu");
    }) as typeof fetch;
    const cliente = criarClienteSessao({ fetcher, armazem, agora });

    await cliente.sair("membro");
    expect(cliente.estado().membro).toBeNull();
  });

  it("sem conexão a requisição falha com status 0 e mantém a sessão", async () => {
    const armazem = armazemMemoria({ "mesaflow:sessao": JSON.stringify(sessaoMembro()) });
    const fetcher = (async () => {
      throw new TypeError("rede caiu");
    }) as typeof fetch;
    const cliente = criarClienteSessao({ fetcher, armazem, agora });

    const erro = await cliente.requisicao("membro", "/teste").catch((e) => e);
    expect(erro.status).toBe(0);
    expect(cliente.estado().membro).not.toBeNull();
  });
});
