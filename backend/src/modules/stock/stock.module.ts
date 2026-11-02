import { Module } from "@nestjs/common";
import { StockController } from "./stock.controller.js";
import { StockService } from "./stock.service.js";

@Module({
  controllers: [StockController],
  providers: [StockService],
  // Os pedidos (etapa 7) usam a baixa e o estorno dentro da transação deles.
  exports: [StockService],
})
export class StockModule {}
