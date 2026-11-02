// Cadastros iniciais, feitos por você no terminal (pede os dados interativamente).
//   npm run seed:admin -w @mesaflow/backend        -> cria um admin da plataforma
//   npm run seed:restaurante -w @mesaflow/backend  -> cria um restaurante com o dono
// Precisa de DATABASE_URL, SUPABASE_URL e SUPABASE_SECRET_KEY no .env.
import { randomInt } from "node:crypto";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import postgres from "postgres";

const comando = process.argv[2];
if (comando !== "admin" && comando !== "restaurante") {
  console.error("Uso: seed.mjs admin | restaurante");
  process.exit(1);
}

for (const nome of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
  if (!process.env[nome]) {
    console.error(`Falta ${nome} no .env`);
    process.exit(1);
  }
}

const authUrl = `${process.env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`;
const secret = process.env.SUPABASE_SECRET_KEY;
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const rl = createInterface({ input: stdin, output: stdout, terminal: true });
let ocultar = false;
const escreverOriginal = rl._writeToOutput.bind(rl);
rl._writeToOutput = (texto) => escreverOriginal(ocultar && !texto.includes(":") ? "*" : texto);

const perguntar = (texto) => new Promise((resolve) => rl.question(texto, (r) => resolve(r.trim())));
async function perguntarSenha(texto) {
  ocultar = true;
  const senha = await perguntar(texto);
  ocultar = false;
  stdout.write("\n");
  return senha;
}
async function obrigatorio(texto, validar = (v) => v.length > 0, erro = "Campo obrigatório.") {
  for (;;) {
    const valor = await perguntar(texto);
    if (validar(valor)) return valor;
    console.log(`  ${erro}`);
  }
}
async function senhaNova() {
  for (;;) {
    const senha = await perguntarSenha("Senha (mínimo 8 caracteres): ");
    if (senha.length < 8) {
      console.log("  Senha curta demais.");
      continue;
    }
    if ((await perguntarSenha("Repita a senha: ")) === senha) return senha;
    console.log("  As senhas não conferem.");
  }
}

async function criarUsuarioAuth(email, password, nome) {
  const res = await fetch(`${authUrl}/admin/users`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: nome } }),
  });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Supabase Auth recusou (${res.status}): ${corpo.msg ?? corpo.message ?? "erro"}`);
  return corpo.id;
}

async function apagarUsuarioAuth(id) {
  await fetch(`${authUrl}/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: secret, Authorization: `Bearer ${secret}` },
  }).catch(() => undefined);
}

const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const soDigitos = (v) => v.replace(/\D/g, "");

async function codigoLivre() {
  for (;;) {
    const code = String(randomInt(100000, 1000000));
    const [existe] = await sql`select 1 from app.companies where code = ${code}`;
    if (!existe) return code;
  }
}

let authUserId = null;
try {
  if (comando === "admin") {
    console.log("\nNovo admin da plataforma MesaFlow\n");
    const name = await obrigatorio("Nome: ");
    const email = (await obrigatorio("E-mail: ", emailValido, "E-mail inválido.")).toLowerCase();
    const password = await senhaNova();
    authUserId = await criarUsuarioAuth(email, password, name);
    await sql`insert into app.platform_admins (auth_user_id, name, email) values (${authUserId}, ${name}, ${email})`;
    console.log(`\nAdmin criado. Entre em /admin/entrar com ${email}.`);
  } else {
    console.log("\nNovo restaurante\n");
    const companyName = await obrigatorio("Nome do restaurante: ");
    const ownerName = await obrigatorio("Nome do dono: ");
    const cpf = soDigitos(await obrigatorio("CPF do dono: ", (v) => soDigitos(v).length === 11, "CPF precisa de 11 dígitos."));
    const email = (await obrigatorio("E-mail do dono: ", emailValido, "E-mail inválido.")).toLowerCase();
    const password = await senhaNova();
    const code = await codigoLivre();

    authUserId = await criarUsuarioAuth(email, password, ownerName);
    await sql.begin(async (tx) => {
      const [company] = await tx`insert into app.companies (code, name) values (${code}, ${companyName}) returning id`;
      await tx`insert into app.members (company_id, auth_user_id, name, cpf, email, role)
               values (${company.id}, ${authUserId}, ${ownerName}, ${cpf}, ${email}, 'owner')`;
    });
    console.log(`\nRestaurante criado. Código de acesso: ${code}`);
    console.log("O dono entra com esse código, o CPF e a senha.");
  }
} catch (err) {
  // Se o banco falhar depois de criar o usuário no Auth, desfaz para não sobrar login órfão.
  if (authUserId) await apagarUsuarioAuth(authUserId);
  console.error(`\nNão foi possível concluir: ${err.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await sql.end();
}
