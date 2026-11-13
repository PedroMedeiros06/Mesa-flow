import { Module } from "@nestjs/common";
import { AdminBillingController, BillingStatusController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";

@Module({ controllers: [AdminBillingController, BillingStatusController], providers: [BillingService] })
export class BillingModule {}
