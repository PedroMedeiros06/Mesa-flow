import { Module } from "@nestjs/common";
import { AdminPlansController, PublicPlansController } from "./plans.controller.js";
import { PlansService } from "./plans.service.js";

@Module({
  controllers: [PublicPlansController, AdminPlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
