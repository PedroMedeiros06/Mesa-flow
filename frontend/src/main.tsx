import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { aplicarTema, lerTema } from "./lib/tema";
import "./index.css";
import "./ui/ui.css";

// Aplica o tema salvo antes do primeiro desenho, para não piscar.
aplicarTema(lerTema());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
