// Prepara o Supabase Storage para as fotos do cardápio.
//   npm run storage:setup -w @mesaflow/backend                   cria o bucket "cardapio" (se não existir)
//   npm run storage:setup -w @mesaflow/backend -- --apagar-antigo  também esvazia e apaga o bucket antigo "catalog-images"
// Precisa de SUPABASE_URL e SUPABASE_SECRET_KEY no .env.

const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !secret) {
  console.error("Faltam SUPABASE_URL e/ou SUPABASE_SECRET_KEY no .env.");
  process.exit(1);
}

const BUCKET = "cardapio";
const ANTIGO = "catalog-images";
const headers = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

async function chamar(metodo, caminho, corpo) {
  const res = await fetch(`${url}/storage/v1${caminho}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await res.text();
  return { ok: res.ok, status: res.status, texto };
}

const config = {
  public: true, // a vitrine mostra as fotos sem login
  file_size_limit: 3 * 1024 * 1024,
  allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
};

const existe = await chamar("GET", `/bucket/${BUCKET}`);
if (existe.ok) {
  const r = await chamar("PUT", `/bucket/${BUCKET}`, { id: BUCKET, ...config });
  console.log(r.ok ? `Bucket "${BUCKET}" já existia; configuração conferida.` : `Erro ao atualizar: ${r.status} ${r.texto}`);
} else {
  const r = await chamar("POST", "/bucket", { id: BUCKET, name: BUCKET, ...config });
  if (!r.ok) {
    console.error(`Erro ao criar o bucket: ${r.status} ${r.texto}`);
    process.exit(1);
  }
  console.log(`Bucket "${BUCKET}" criado (público, até 3 MB, JPG/PNG/WEBP).`);
}

if (process.argv.includes("--apagar-antigo")) {
  const antigo = await chamar("GET", `/bucket/${ANTIGO}`);
  if (!antigo.ok) {
    console.log(`Bucket antigo "${ANTIGO}" não existe; nada a apagar.`);
  } else {
    const vazio = await chamar("POST", `/bucket/${ANTIGO}/empty`);
    const apagado = vazio.ok ? await chamar("DELETE", `/bucket/${ANTIGO}`) : vazio;
    console.log(apagado.ok ? `Bucket antigo "${ANTIGO}" apagado.` : `Erro ao apagar: ${apagado.status} ${apagado.texto}`);
  }
}
