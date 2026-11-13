import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// O esbuild (padrão do Vitest) não gera os metadados de decorators que a injeção de
// dependência do Nest usa. O SWC gera, então os testes montam o app igual à produção.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    // Cada arquivo sobe um Postgres em memória e roda as migrações; com vários em paralelo, passa dos 10 s padrão.
    hookTimeout: 60_000,
    // O primeiro teste de cada arquivo paga o aquecimento do Postgres em memória; com a máquina
    // ocupada (npm run check), passava dos 5 s padrão e falhava sem erro de lógica.
    testTimeout: 30_000,
    env: {
      SUPABASE_URL: "https://teste.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_teste",
    },
  },
});
