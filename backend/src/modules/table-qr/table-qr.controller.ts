import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { tableCodesQuerySchema, type MemberProfile } from "@mesaflow/shared";
import { z } from "zod";
import { CurrentMember, RequirePermission } from "../../auth/auth-context.js";
import { MemberGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { TableQrService } from "./table-qr.service.js";
import { ModuloGuard, RequireModule } from "../plan-limits/modulo.guard.js";

const mesa = new ZodValidationPipe(z.coerce.number().int().min(1, "Mesa de 1 a 999").max(999, "Mesa de 1 a 999"));

@Controller("table-codes")
@UseGuards(MemberGuard, ModuloGuard)
@RequireModule("tabs")
export class TableCodesController {
  constructor(private readonly qr: TableQrService) {}

  @Get()
  @RequirePermission("company.manage")
  list(
    @CurrentMember() m: MemberProfile,
    @Query(new ZodValidationPipe(tableCodesQuerySchema)) q: z.output<typeof tableCodesQuerySchema>,
  ) {
    return this.qr.codes(m.company.id, q.from, q.to);
  }

  @Post(":tableNumber/regenerate")
  @RequirePermission("company.manage")
  regenerate(@CurrentMember() m: MemberProfile, @Param("tableNumber", mesa) n: number) {
    return this.qr.regenerate(m.company.id, n);
  }
}

@Controller("waiter-calls")
@UseGuards(MemberGuard, ModuloGuard)
@RequireModule("tabs")
export class WaiterCallsController {
  constructor(private readonly qr: TableQrService) {}

  @Get()
  @RequirePermission("tabs.view")
  pending(@CurrentMember() m: MemberProfile) {
    return this.qr.pendingCalls(m.company.id);
  }
}
