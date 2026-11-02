import { lazy, Suspense, useEffect, useState } from "react";
import type { HealthResponse } from "@mesaflow/shared";
import { fetchHealth } from "@/lib/api";

// Protótipos da etapa 4 (descartáveis): abertos em /prototipo enquanto não há rotas de verdade.
const Prototipo = lazy(() => import("@/prototipo/Prototipo"));

export function App() {
  if (window.location.pathname.startsWith("/prototipo")) {
    return (
      <Suspense fallback={null}>
        <Prototipo />
      </Suspense>
    );
  }
  return <Verificacao />;
}

type Estado =
  | { tipo: "carregando" }
  | { tipo: "ok"; health: HealthResponse }
  | { tipo: "erro"; mensagem: string };

const BANCO: Record<HealthResponse["database"], string> = {
  ok: "conectado",
  down: "sem resposta",
  not_configured: "não configurado (falta DATABASE_URL no .env)",
};

// Tela provisória da etapa 1: só prova que front, back e shared conversam.
function Verificacao() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });

  const verificar = () => {
    setEstado({ tipo: "carregando" });
    fetchHealth()
      .then((health) => setEstado({ tipo: "ok", health }))
      .catch((err: unknown) =>
        setEstado({ tipo: "erro", mensagem: err instanceof Error ? err.message : "Erro desconhecido." }),
      );
  };

  useEffect(verificar, []);

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "64px 16px" }}>
      <h1 style={{ fontSize: 40, margin: 0 }}>MesaFlow</h1>
      <p style={{ color: "var(--tinta-2)", marginTop: 8 }}>
        Esqueleto do projeto: verificação da API. Protótipos visuais em <a href="/prototipo">/prototipo</a>.
      </p>

      <section
        aria-live="polite"
        style={{
          marginTop: 32,
          padding: 20,
          borderRadius: 14,
          background: "var(--papel)",
          border: "1px solid var(--linha)",
        }}
      >
        {estado.tipo === "carregando" && <p style={{ margin: 0 }}>Consultando a API...</p>}

        {estado.tipo === "ok" && (
          <>
            <p style={{ margin: 0, fontWeight: 700 }}>API no ar</p>
            <p style={{ margin: "6px 0 0", color: "var(--tinta-2)", fontSize: 14 }}>
              {estado.health.service} v{estado.health.version}, resposta às{" "}
              {new Date(estado.health.time).toLocaleTimeString("pt-BR")}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 14 }}>Banco: {BANCO[estado.health.database]}</p>
          </>
        )}

        {estado.tipo === "erro" && (
          <>
            <p style={{ margin: 0, fontWeight: 700, color: "var(--brasa-texto)" }}>API fora do ar</p>
            <p style={{ margin: "6px 0 12px", color: "var(--tinta-2)", fontSize: 14 }}>{estado.mensagem}</p>
            <button
              type="button"
              onClick={verificar}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: 0,
                background: "var(--laranja)",
                color: "var(--sobre-cor)",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Tentar de novo
            </button>
          </>
        )}
      </section>
    </main>
  );
}
