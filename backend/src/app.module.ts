import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { DatabaseModule } from "./db/database.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { BillingModule } from "./modules/billing/billing.module.js";
import { CompaniesModule } from "./modules/companies/companies.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { MembersModule } from "./modules/members/members.module.js";
import { OrdersModule } from "./modules/orders/orders.module.js";
import { StockModule } from "./modules/stock/stock.module.js";
import { StorefrontModule } from "./modules/storefront/storefront.module.js";
import { TableQrModule } from "./modules/table-qr/table-qr.module.js";
import { TabsModule } from "./modules/tabs/tabs.module.js";

@Module({
  imports: [DatabaseModule, AuthModule, HealthModule, CatalogModule, StockModule, OrdersModule, StorefrontModule, TabsModule, TableQrModule, MembersModule, DashboardModule, CompaniesModule, AdminModule, BillingModule],
})
export class AppModule {}
