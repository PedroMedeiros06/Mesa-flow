import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// O esbuild (padrão do Vitest) não gera os metadados de decorators que a injeção de
// dependência do Nest usa. O SWC gera, então os testes montam o app igual à produção.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    env: {
      SUPABASE_URL: "https://teste.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_teste",
    },
  },
});
