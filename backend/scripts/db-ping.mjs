// Testa a conexão com o banco sem imprimir a senha. Uso: npm run db:ping -w @mesaflow/backend
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
if (!url) {
  console.error("DATABASE_URL vazio no .env");
  process.exit(1);
}

console.log("host:", url.split("@")[1]?.split("/")[0] ?? "(formato inesperado)");
const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
try {
  const [row] = await sql`select current_user, split_part(version(), ' ', 2) as pg`;
  console.log(`conectado como ${row.current_user}, Postgres ${row.pg}`);
} catch (err) {
  console.error("falhou:", err.code ?? "", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
