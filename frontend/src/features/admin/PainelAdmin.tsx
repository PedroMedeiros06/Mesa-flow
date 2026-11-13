import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { ApiErro } from "@/lib/http";
import { sessao } from "@/lib/sessao";
import { useSessao } from "@/lib/useSessao";
import { Casca, type ItemCasca } from "@/features/painel/Casca";

const MENU_ADMIN: ItemCasca[] = [
  { id: "inicio", nome: "Visão geral", icone: "inicio", caminho: "/admin" },
  { id: "restaurantes", nome: "Restaurantes", icone: "loja", caminho: "/admin/restaurantes" },
  { id: "cobranca", nome: "Cobrança", icone: "cobranca", caminho: "/admin/cobranca" },
];

/** /admin: só para a equipe MesaFlow. */
export function PainelAdmin() {
  const atual = useSessao("admin");
  const local = useLocation();
  const navegar = useNavigate();

  useEffect(() => {
    sessao.atualizarPerfil("admin").catch((erro: unknown) => {
      if (erro instanceof ApiErro && (erro.status === 401 || erro.status === 403)) {
        navegar("/admin/entrar", { replace: true });
      }
    });
  }, [navegar]);

  if (!atual) return <Navigate to="/admin/entrar" replace state={{ de: local.pathname }} />;

  return (
    <Casca
      inicio="/admin"
      itens={MENU_ADMIN}
      topo={
        <div className="trilho-rest">
          <strong>Administração</strong>
          <span>Equipe MesaFlow</span>
        </div>
      }
      pessoa={{ nome: atual.profile.admin.name, papel: "Admin" }}
      aoSair={() => sessao.sair("admin")}
    />
  );
}
