import { useEffect, useState } from "react";

export type Tema = "sistema" | "light" | "dark";
const CHAVE = "mesaflow:tema";

export function lerTema(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE);
    return salvo === "light" || salvo === "dark" ? salvo : "sistema";
  } catch {
    return "sistema";
  }
}

export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "sistema") raiz.removeAttribute("data-theme");
  else raiz.setAttribute("data-theme", tema);
}

/** Tema escolhido pela pessoa neste aparelho. "sistema" segue o claro/escuro do celular ou computador. */
export function useTema() {
  const [tema, setTema] = useState<Tema>(lerTema);
  useEffect(() => {
    aplicarTema(tema);
    try {
      if (tema === "sistema") localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, tema);
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  }, [tema]);
  return [tema, setTema] as const;
}
