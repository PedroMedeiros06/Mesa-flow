import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module.js";
import { LimitePedidosGuard } from "./limite.guard.js";
import { StorefrontController } from "./storefront.controller.js";
import { StorefrontService } from "./storefront.service.js";

@Module({
  imports: [OrdersModule],
  controllers: [StorefrontController],
  providers: [StorefrontService, LimitePedidosGuard],
})
export class StorefrontModule {}
