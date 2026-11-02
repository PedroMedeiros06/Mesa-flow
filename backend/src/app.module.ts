import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { DatabaseModule } from "./db/database.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { HealthModule } from "./modules/health/health.module.js";

@Module({
  imports: [DatabaseModule, AuthModule, HealthModule, CatalogModule],
})
export class AppModule {}
