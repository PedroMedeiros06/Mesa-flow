import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module.js";
import { StockModule } from "../stock/stock.module.js";
import { TabsController } from "./tabs.controller.js";
import { TabsService } from "./tabs.service.js";

@Module({
  imports: [OrdersModule, StockModule],
  controllers: [TabsController],
  providers: [TabsService],
  exports: [TabsService],
})
export class TabsModule {}
