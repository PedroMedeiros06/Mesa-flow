import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { CompanySettings, companySettingsInputSchema } from "@mesaflow/shared";
import type { z } from "zod";
import { DB, type Database } from "../../db/database.module.js";
import { companies } from "../../db/schema.js";

const campos = {
  code: companies.code,
  name: companies.name,
  legalName: companies.legalName,
  document: companies.document,
  whatsapp: companies.whatsapp,
};

/** Dados do restaurante da sessão (tela Ajustes). */
@Injectable()
export class CompaniesService {
  constructor(@Inject(DB) private readonly db: Database | null) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  async get(companyId: string): Promise<CompanySettings> {
    const [c] = await this.conn.select(campos).from(companies).where(eq(companies.id, companyId));
    if (!c) throw new NotFoundException({ statusCode: 404, message: "Restaurante não encontrado." });
    return c;
  }

  async update(companyId: string, dados: z.output<typeof companySettingsInputSchema>): Promise<CompanySettings> {
    const [c] = await this.conn.update(companies).set(dados).where(eq(companies.id, companyId)).returning(campos);
    if (!c) throw new NotFoundException({ statusCode: 404, message: "Restaurante não encontrado." });
    return c;
  }
}
