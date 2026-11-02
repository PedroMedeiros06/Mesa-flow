import { useEffect, useState } from "react";
import "./prototipo.css";
import { Inicio } from "./telas/Inicio";
import { Entrar } from "./telas/Entrar";
import { Vitrine } from "./telas/Vitrine";
import { Painel } from "./telas/Painel";

const TELAS = [
  { id: "inicio", nome: "Site" },
  { id: "entrar", nome: "Entrar" },
  { id: "vitrine", nome: "Vitrine" },
  { id: "painel", nome: "Painel" },
  { id: "mesas", nome: "Mesas" },
  { id: "cozinha", nome: "Cozinha" },
] as const;

export type IdTela = (typeof TELAS)[number]["id"];
type Tema = "sistema" | "light" | "dark";

function telaDaUrl(): IdTela {
  const id = window.location.pathname.split("/")[2];
  return TELAS.find((t) => t.id === id)?.id ?? "inicio";
}

function lerTema(): Tema {
  try {
    const salvo = localStorage.getItem("mesaflow:tema");
    return salvo === "light" || salvo === "dark" ? salvo : "sistema";
  } catch {
    return "sistema";
  }
}

export default function Prototipo() {
  const [tela, setTela] = useState<IdTela>(telaDaUrl);
  const [tema, setTema] = useState<Tema>(lerTema);

  useEffect(() => {
    const voltar = () => setTela(telaDaUrl());
    window.addEventListener("popstate", voltar);
    return () => window.removeEventListener("popstate", voltar);
  }, []);

  useEffect(() => {
    const raiz = document.documentElement;
    if (tema === "sistema") raiz.removeAttribute("data-theme");
    else raiz.setAttribute("data-theme", tema);
    try {
      if (tema === "sistema") localStorage.removeItem("mesaflow:tema");
      else localStorage.setItem("mesaflow:tema", tema);
    } catch {
      // sem armazenamento: o tema vale só nesta visita
    }
  }, [tema]);

  const ir = (id: IdTela) => (e: React.MouseEvent) => {
    e.preventDefault();
    window.history.pushState(null, "", `/prototipo/${id}`);
    setTela(id);
    window.scrollTo(0, 0);
  };

  return (
    <>
      <div className="pbar" role="navigation" aria-label="Telas do protótipo">
        <strong>Protótipo</strong>
        <nav>
          {TELAS.map((t) => (
            <a
              key={t.id}
              href={`/prototipo/${t.id}`}
              onClick={ir(t.id)}
              aria-current={t.id === tela ? "page" : undefined}
            >
              {t.nome}
            </a>
          ))}
        </nav>
        <select aria-label="Tema" value={tema} onChange={(e) => setTema(e.target.value as Tema)}>
          <option value="sistema">Tema do sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Escuro</option>
        </select>
      </div>

      {tela === "inicio" && <Inicio />}
      {tela === "entrar" && <Entrar />}
      {tela === "vitrine" && <Vitrine />}
      {(tela === "painel" || tela === "mesas" || tela === "cozinha") && <Painel tela={tela} ir={ir} />}
    </>
  );
}
