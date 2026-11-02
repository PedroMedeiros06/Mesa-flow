// Leitura das variáveis de ambiente. Falha cedo, com mensagem clara, quando falta algo obrigatório.
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente ${name} não definida (veja .env.example).`);
  return value;
}

export function supabaseConfig() {
  const url = required("SUPABASE_URL").replace(/\/+$/, "");
  return {
    url,
    authUrl: `${url}/auth/v1`,
    publishableKey: required("SUPABASE_PUBLISHABLE_KEY"),
  };
}
