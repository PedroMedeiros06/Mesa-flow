import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { HealthResponse } from "@mesaflow/shared";
import { DB, type Database } from "../../db/database.module.js";

const VERSION = process.env.npm_package_version ?? "0.1.0";

@Controller("health")
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database | null) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const database = await this.checkDatabase();
    return {
      status: database === "down" ? "degraded" : "ok",
      service: "mesaflow-api",
      version: VERSION,
      time: new Date().toISOString(),
      database,
    };
  }

  private async checkDatabase(): Promise<HealthResponse["database"]> {
    if (!this.db) return "not_configured";
    try {
      await this.db.execute(sql`select 1`);
      return "ok";
    } catch {
      return "down";
    }
  }
}
