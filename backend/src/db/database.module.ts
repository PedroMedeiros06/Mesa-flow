import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

export const DB = Symbol("DB");
const SQL_CLIENT = Symbol("SQL_CLIENT");

// Sem DATABASE_URL a API sobe mesmo assim (o /health avisa "not_configured"),
// para dar para rodar o front e os testes sem banco.
@Global()
@Module({
  providers: [
    {
      provide: SQL_CLIENT,
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        if (!url) return null;
        // prepare: false mantém compatibilidade com o pooler do Supabase.
        return postgres(url, { max: 10, prepare: false, onnotice: () => {} });
      },
    },
    {
      provide: DB,
      inject: [SQL_CLIENT],
      useFactory: (client: postgres.Sql | null): Database | null => (client ? drizzle(client, { schema }) : null),
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(SQL_CLIENT) private readonly client: postgres.Sql | null) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client?.end({ timeout: 5 });
  }
}
