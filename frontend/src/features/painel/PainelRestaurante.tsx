import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import type { Permission } from "@mesaflow/shared";
import { primeiroNome, saudacao } from "@/lib/formato";
import { ApiErro } from "@/lib/http";
import { sessao } from "@/lib/sessao";
import { useSessao } from "@/lib/useSessao";
import { Aviso, Comanda, CorteComanda } from "@/ui/componentes";
import { Casca } from "./Casca";
import { MENU_PAINEL, menuVisivel, podeVer } from "./menu";

/** /app: só entra quem tem sessão de restaurante. O perfil é relido do servidor ao abrir. */
export function PainelRestaurante() {
  const atual = useSessao("membro");
  const local = useLocation();
  const navegar = useNavigate();

  useEffect(() => {
    sessao.atualizarPerfil("membro").catch((erro: unknown) => {
      if (erro instanceof ApiErro && (erro.status === 401 || erro.status === 403)) {
        navegar("/entrar", { replace: true, state: { motivo: erro.message } });
      }
    });
  }, [navegar]);

  if (!atual) return <Navigate to="/entrar" replace state={{ de: local.pathname }} />;

  const { member, company } = atual.profile;
  return (
    <Casca
      inicio="/app"
      itens={menuVisivel(atual.profile)}
      topo={
        <div className="trilho-rest">
          <strong>{company.name}</strong>
          <span>Código {company.code}</span>
        </div>
      }
      pessoa={{ nome: member.name, papel: member.role === "owner" ? "Dono" : "Equipe" }}
      aoSair={() => sessao.sair("membro")}
    />
  );
}

/** Mostra a tela só para quem tem a permissão; o backend confere de novo em cada chamada. */
export function RequerPermissao({ permissao, children }: { permissao?: Permission; children: ReactNode }) {
  const atual = useSessao("membro");
  if (!atual) return null;
  const item = { ...MENU_PAINEL[0]!, permissao };
  if (!podeVer(atual.profile, item)) {
    return (
      <div className="vazio">
        <h1 style={{ fontSize: "var(--t-3xl)", fontWeight: 800 }}>Sem acesso</h1>
        <p className="suave">Você não tem permissão para esta tela. Peça ao dono do restaurante para liberar.</p>
      </div>
    );
  }
  return children;
}

export function EmBreve({ titulo, etapa }: { titulo: string; etapa: number }) {
  return (
    <>
      <div className="cab">
        <h1>{titulo}</h1>
      </div>
      <div className="vazio">
        <Aviso tom="info">Esta tela está em construção e chega na etapa {etapa} do projeto.</Aviso>
      </div>
    </>
  );
}

export function InicioRestaurante() {
  const atual = useSessao("membro");
  if (!atual) return null;
  const { member, company } = atual.profile;
  return (
    <>
      <div className="cab">
        <div>
          <h1>
            {saudacao()}, {primeiroNome(member.name)}
          </h1>
          <p className="suave" style={{ marginTop: 6 }}>
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
      </div>
      <div className="vazio">
        <Comanda>
          <div className="comanda-linha suave">
            <span>{company.name}</span>
          </div>
          <p style={{ marginTop: 8 }}>
            <span className="numeral">{company.code}</span>
          </p>
          <CorteComanda />
          <p>Código do restaurante. Sua equipe usa este código, o CPF e a senha para entrar.</p>
        </Comanda>
        <Aviso tom="info">O resumo do dia (vendas, pedidos e mais vendidos) aparece aqui na etapa 10.</Aviso>
      </div>
    </>
  );
}
