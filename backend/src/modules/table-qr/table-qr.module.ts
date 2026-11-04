import { Module } from "@nestjs/common";
import { TabsModule } from "../tabs/tabs.module.js";
import { LimiteChamadosGuard } from "./limite-chamados.guard.js";
import { PublicTableController } from "./public-table.controller.js";
import { TableCodesController, WaiterCallsController } from "./table-qr.controller.js";
import { TableQrService } from "./table-qr.service.js";

@Module({
  imports: [TabsModule],
  controllers: [PublicTableController, TableCodesController, WaiterCallsController],
  providers: [TableQrService, LimiteChamadosGuard],
})
export class TableQrModule {}
