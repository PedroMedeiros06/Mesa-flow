import { createBrowserRouter, Link, type RouteObject } from "react-router";
import { Entrar } from "@/features/acesso/Entrar";
import { EntrarAdmin } from "@/features/acesso/EntrarAdmin";
import { Cardapio } from "@/features/cardapio/Cardapio";
import { Estoque } from "@/features/estoque/Estoque";
import { AcompanharPedido } from "@/features/loja/AcompanharPedido";
import { Loja } from "@/features/loja/Loja";
import { MinhaMesa } from "@/features/loja/MinhaMesa";
import { Mesas } from "@/features/mesas/Mesas";
import { Balcao } from "@/features/pedidos/Balcao";
import { Cozinha } from "@/features/pedidos/Cozinha";
import { Pedidos } from "@/features/pedidos/Pedidos";
import { DefinirSenha } from "@/features/acesso/DefinirSenha";
import { EsqueciSenha } from "@/features/acesso/EsqueciSenha";
import { Equipe } from "@/features/equipe/Equipe";
import { PainelAdmin } from "@/features/admin/PainelAdmin";
import { MENU_PAINEL } from "@/features/painel/menu";
import { EmBreve, InicioRestaurante, PainelRestaurante, RequerPermissao } from "@/features/painel/PainelRestaurante";
import { Site } from "@/features/site/Site";
import { Aviso, Marca, classeBotao } from "@/ui/componentes";
import { Status } from "./Status";

function NaoEncontrado() {
  return (
    <main style={{ padding: "64px 16px", maxWidth: 480, margin: "0 auto", display: "grid", gap: 20 }}>
      <Marca />
      <h1 style={{ fontSize: "var(--t-4xl)", fontWeight: 800 }}>Página não encontrada</h1>
      <p className="suave">O endereço pode ter mudado ou estar digitado errado.</p>
      <Link className={classeBotao("primario")} to="/">
        Ir para o início
      </Link>
    </main>
  );
}

// Telas prontas; as demais mostram "em construção" até a etapa delas.
const TELAS: Record<string, React.ReactNode> = {
  mesas: <Mesas />,
  balcao: <Balcao />,
  cozinha: <Cozinha />,
  pedidos: <Pedidos />,
  cardapio: <Cardapio />,
  estoque: <Estoque />,
  equipe: <Equipe />,
};

const telasRestaurante: RouteObject[] = MENU_PAINEL.filter((item) => item.caminho !== "/app").map((item) => ({
  path: item.caminho.replace("/app/", ""),
  element: (
    <RequerPermissao permissao={item.permissao}>
      {TELAS[item.id] ?? <EmBreve titulo={item.nome} etapa={item.etapa} />}
    </RequerPermissao>
  ),
}));

export const rotas: RouteObject[] = [
  { path: "/", element: <Site /> },
  { path: "/entrar", element: <Entrar /> },
  { path: "/esqueci-senha", element: <EsqueciSenha /> },
  { path: "/senha", element: <DefinirSenha /> },
  { path: "/loja/:codigo", element: <Loja /> },
  { path: "/loja/:codigo/pedido/:id", element: <AcompanharPedido /> },
  { path: "/mesa/:token", element: <MinhaMesa /> },
  { path: "/status", element: <Status /> },
  {
    path: "/app",
    element: <PainelRestaurante />,
    children: [{ index: true, element: <InicioRestaurante /> }, ...telasRestaurante],
  },
  { path: "/admin/entrar", element: <EntrarAdmin /> },
  {
    path: "/admin",
    element: <PainelAdmin />,
    children: [
      { index: true, element: <EmBreve titulo="Visão geral" etapa={11} /> },
      { path: "restaurantes", element: <EmBreve titulo="Restaurantes" etapa={11} /> },
      { path: "cobranca", element: <EmBreve titulo="Cobrança" etapa={11} /> },
    ],
  },
  { path: "*", element: <NaoEncontrado /> },
];

export const roteador = createBrowserRouter(rotas);
