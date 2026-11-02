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

const NOMES_TEMA: Record<Tema, string> = { sistema: "Tema do aparelho", light: "Claro", dark: "Escuro" };

function SeletorTema({ id }: { id: string }) {
  const [tema, setTema] = useTema();
  return (
    <>
      <label htmlFor={id} className="so-leitor">
        Tema
      </label>
      <select id={id} value={tema} onChange={(e) => setTema(e.target.value as Tema)}>
        {(Object.keys(NOMES_TEMA) as Tema[]).map((t) => (
          <option key={t} value={t}>
            {NOMES_TEMA[t]}
          </option>
        ))}
      </select>
    </>
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
}: {
  itens: ItemCasca[];
  /** Caminho da tela inicial (o link dela só fica ativo na própria tela). */
  inicio: string;
  topo: ReactNode;
  pessoa: { nome: string; papel: string };
  aoSair: () => Promise<void>;
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
          <span>
            <strong>{pessoa.nome}</strong>
            {pessoa.papel}
          </span>
          <div className="trilho-acoes">
            <SeletorTema id="tema-trilho" />
            <button type="button" onClick={() => setConfirmarSaida(true)}>
              <Icone nome="sair" tamanho={16} />
              Sair
            </button>
          </div>
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
            <span className="lista-mais-tema" style={{ display: "flex", alignItems: "center", gap: 12, padding: 12 }}>
              <Icone nome="ajustes" />
              <strong>Tema</strong>
              <span style={{ marginLeft: "auto" }}>
                <SeletorTema id="tema-mais" />
              </span>
            </span>
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
