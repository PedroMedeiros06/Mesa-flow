import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// O drizzle-kit não lê o .env sozinho; o .env fica na raiz do repositório.
if (existsSync("../.env")) process.loadEnvFile("../.env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["app"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  migrations: { schema: "drizzle", table: "__migrations" },
  strict: true,
  verbose: true,
});
