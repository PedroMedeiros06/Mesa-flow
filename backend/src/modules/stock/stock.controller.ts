import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import {
  ingredientCreateSchema,
  ingredientInputSchema,
  movementInputSchema,
  type MemberProfile,
} from "@mesaflow/shared";
import type { z } from "zod";
import { CurrentMember, RequirePermission } from "../../auth/auth-context.js";
import { MemberGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { StockService } from "./stock.service.js";
import { ModuloGuard, RequireModule } from "../plan-limits/modulo.guard.js";

const uuid = new ParseUUIDPipe({ version: "4" });

@Controller("stock/ingredients")
@UseGuards(MemberGuard, ModuloGuard)
@RequireModule("stock")
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @RequirePermission("stock.manage")
  list(@CurrentMember() m: MemberProfile) {
    return this.stock.list(m.company.id);
  }

  @Post()
  @RequirePermission("stock.manage")
  create(
    @CurrentMember() m: MemberProfile,
    @Body(new ZodValidationPipe(ingredientCreateSchema)) body: z.output<typeof ingredientCreateSchema>,
  ) {
    return this.stock.create(m.company.id, m.member.id, body);
  }

  @Patch(":id")
  @RequirePermission("stock.manage")
  update(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(ingredientInputSchema)) body: z.output<typeof ingredientInputSchema>,
  ) {
    return this.stock.update(m.company.id, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("stock.manage")
  async delete(@CurrentMember() m: MemberProfile, @Param("id", uuid) id: string) {
    await this.stock.delete(m.company.id, id);
  }

  @Get(":id/movements")
  @RequirePermission("stock.manage")
  movements(@CurrentMember() m: MemberProfile, @Param("id", uuid) id: string) {
    return this.stock.movements(m.company.id, id);
  }

  @Post(":id/movements")
  @RequirePermission("stock.manage")
  move(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(movementInputSchema)) body: z.output<typeof movementInputSchema>,
  ) {
    return this.stock.move(m.company.id, m.member.id, id, body);
  }
}
