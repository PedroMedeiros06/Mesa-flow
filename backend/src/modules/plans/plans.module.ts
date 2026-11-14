import { Module } from "@nestjs/common";
import { AdminAddonsController, AdminPlansController, PublicPlansController } from "./plans.controller.js";
import { PlansService } from "./plans.service.js";

@Module({
  controllers: [PublicPlansController, AdminPlansController, AdminAddonsController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
