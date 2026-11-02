import { Module } from "@nestjs/common";
import { StorageClient } from "../../storage/storage.client.js";
import { StockModule } from "../stock/stock.module.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

@Module({
  imports: [StockModule],
  controllers: [OrdersController],
  providers: [OrdersService, StorageClient],
})
export class OrdersModule {}
