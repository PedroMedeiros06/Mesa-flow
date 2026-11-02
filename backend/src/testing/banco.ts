import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../db/database.module.js";
import * as schema from "../db/schema.js";

/**
 * Postgres de verdade em memória (pglite) com as mesmas migrações que vão para o Supabase.
 * O schema "auth" do Supabase é simulado só com a tabela users, usada pelas chaves estrangeiras.
 */
export async function criarBancoDeTeste() {
  const pg = new PGlite();
  await pg.exec("create schema auth; create table auth.users (id uuid primary key);");
  const db = drizzle(pg, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
    migrationsSchema: "drizzle",
    migrationsTable: "__migrations",
  });
  return {
    db: db as unknown as Database,
    /** Apaga todos os dados entre um teste e outro. */
    limpar: () => db.execute(sql`truncate app.companies, app.platform_admins, auth.users cascade`),
    fechar: () => pg.close(),
  };
}

export type BancoDeTeste = Awaited<ReturnType<typeof criarBancoDeTeste>>;

let sequencia = 0;

/** Cria um restaurante com uma pessoa da equipe e devolve os ids para montar o token. */
export async function criarRestaurante(
  banco: BancoDeTeste,
  opcoes: { role?: "owner" | "employee"; permissions?: string[]; nome?: string } = {},
) {
  sequencia++;
  const authUserId = crypto.randomUUID();
  await banco.db.execute(sql`insert into auth.users (id) values (${authUserId})`);
  const [company] = await banco.db
    .insert(schema.companies)
    .values({ code: String(100000 + sequencia), name: opcoes.nome ?? `Restaurante ${sequencia}` })
    .returning();
  const [member] = await banco.db
    .insert(schema.members)
    .values({
      companyId: company!.id,
      authUserId,
      name: `Pessoa ${sequencia}`,
      cpf: String(sequencia).padStart(11, "0"),
      email: `p${sequencia}@teste.com`,
      role: opcoes.role ?? "owner",
      permissions: opcoes.permissions ?? [],
    })
    .returning();
  return { authUserId, companyId: company!.id, memberId: member!.id };
}

/** Outra pessoa no mesmo restaurante. */
export async function criarPessoa(
  banco: BancoDeTeste,
  companyId: string,
  opcoes: { role?: "owner" | "employee"; permissions?: string[] } = {},
) {
  sequencia++;
  const authUserId = crypto.randomUUID();
  await banco.db.execute(sql`insert into auth.users (id) values (${authUserId})`);
  await banco.db.insert(schema.members).values({
    companyId,
    authUserId,
    name: `Pessoa ${sequencia}`,
    cpf: String(sequencia).padStart(11, "0"),
    email: `p${sequencia}@teste.com`,
    role: opcoes.role ?? "employee",
    permissions: opcoes.permissions ?? [],
  });
  return { authUserId };
}
