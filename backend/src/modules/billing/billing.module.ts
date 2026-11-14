import { Module } from "@nestjs/common";
import { PlansModule } from "../plans/plans.module.js";
import { AdminBillingController, BillingStatusController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";

@Module({ imports: [PlansModule], controllers: [AdminBillingController, BillingStatusController], providers: [BillingService] })
export class BillingModule {}
