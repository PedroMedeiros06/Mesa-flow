import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useTema, type Tema } from "@/lib/tema";
import { Botao, Dialogo, Marca } from "@/ui/componentes";
import { Icone, type NomeIcone } from "@/ui/Icone";
import "./painel.css";

export interface ItemCasca {
  id: string;
  nome: string;
  icone: NomeIcone;
  caminho: string;
}

const TEMAS: { tema: Tema; nome: string; icone: NomeIcone }[] = [
  { tema: "sistema", nome: "Auto", icone: "automatico" },
  { tema: "light", nome: "Claro", icone: "sol" },
  { tema: "dark", nome: "Escuro", icone: "lua" },
];

/** Três botões em vez de um select: o tema atual fica à vista e troca com um toque. */
function SeletorTema() {
  const [tema, setTema] = useTema();
  return (
    <div className="tema-seg" role="group" aria-label="Tema">
      {TEMAS.map((t) => (
        <button
          key={t.tema}
          type="button"
          aria-pressed={tema === t.tema}
          title={t.tema === "sistema" ? "Segue o tema do aparelho" : undefined}
          onClick={() => setTema(t.tema)}
        >
          <Icone nome={t.icone} tamanho={15} />
          {t.nome}
        </button>
      ))}
    </div>
  );
}

/**
 * Casca comum do painel do restaurante e do admin.
 * Computador: barra lateral. Celular: até 4 abas embaixo e o resto em "Mais".
 */
export function Casca({
  itens,
  inicio,
  topo,
  pessoa,
  aoSair,
  alerta,
}: {
  itens: ItemCasca[];
  /** Caminho da tela inicial (o link dela só fica ativo na própria tela). */
  inicio: string;
  topo: ReactNode;
  pessoa: { nome: string; papel: string };
  aoSair: () => Promise<void>;
  /** Faixa fixa acima do conteúdo, em todas as telas (ex.: mesa chamando o garçom). */
  alerta?: ReactNode;
}) {
  const [maisAberto, setMaisAberto] = useState(false);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const abas = itens.slice(0, 4);
  const mais = itens.slice(4);

  const sair = async () => {
    setSaindo(true);
    await aoSair();
  };

  return (
    <div className="painel">
      <a className="so-leitor" href="#conteudo">
        Pular para o conteúdo
      </a>
      <aside className="trilho">
        <Marca para={inicio} className="marca-trilho" />
        {topo}
        <nav aria-label="Menu principal">
          {itens.map((item) => (
            <NavLink key={item.id} to={item.caminho} end={item.caminho === inicio}>
              <Icone nome={item.icone} />
              {item.nome}
            </NavLink>
          ))}
        </nav>
        <div className="trilho-pe">
          <div className="trilho-pessoa">
            <span className="avatar" aria-hidden="true">
              {pessoa.nome.trim().charAt(0).toUpperCase()}
            </span>
            <span className="trilho-pessoa-nome">
              <strong>{pessoa.nome}</strong>
              {pessoa.papel}
            </span>
            <button type="button" className="trilho-sair" onClick={() => setConfirmarSaida(true)} aria-label="Sair" title="Sair">
              <Icone nome="sair" tamanho={18} />
            </button>
          </div>
          <SeletorTema />
        </div>
      </aside>

      <main className="conteudo" id="conteudo" tabIndex={-1}>
        <div className="topo-celular">
          <Link className="marca" to={inicio} style={{ fontSize: "var(--t-lg)", color: "var(--tinta)" }}>
            <span className="marca-selo" aria-hidden="true" />
            MesaFlow
          </Link>
          <span>{pessoa.nome}</span>
        </div>
        {alerta}
        <Outlet />
      </main>

      <nav className="abas-baixo" aria-label="Menu principal no celular">
        {abas.map((item) => (
          <NavLink key={item.id} to={item.caminho} end={item.caminho === inicio}>
            <Icone nome={item.icone} />
            {item.nome}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMaisAberto(true)} aria-haspopup="dialog">
          <Icone nome="grade" />
          Mais
        </button>
      </nav>

      <Dialogo
        aberto={maisAberto}
        aoFechar={() => setMaisAberto(false)}
        titulo="Mais opções"
        acoes={
          <Botao variante="claro" onClick={() => setMaisAberto(false)}>
            Fechar
          </Botao>
        }
      >
        <ul className="lista-mais">
          {mais.map((item) => (
            <li key={item.id}>
              <Link to={item.caminho} onClick={() => setMaisAberto(false)}>
                <Icone nome={item.icone} />
                {item.nome}
              </Link>
            </li>
          ))}
          <li>
            <div className="lista-mais-tema">
              <strong>Tema</strong>
              <SeletorTema />
            </div>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                setMaisAberto(false);
                setConfirmarSaida(true);
              }}
            >
              <Icone nome="sair" />
              Sair
            </button>
          </li>
        </ul>
      </Dialogo>

      <Dialogo
        aberto={confirmarSaida}
        aoFechar={() => setConfirmarSaida(false)}
        titulo="Sair do MesaFlow?"
        acoes={
          <>
            <Botao variante="claro" onClick={() => setConfirmarSaida(false)}>
              Continuar aqui
            </Botao>
            <Botao onClick={sair} carregando={saindo} textoCarregando="Saindo...">
              Sair
            </Botao>
          </>
        }
      >
        <p className="suave">Neste aparelho, você vai precisar entrar de novo com sua senha.</p>
      </Dialogo>
    </div>
  );
}
