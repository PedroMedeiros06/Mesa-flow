import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { planInputSchema, planOrderSchema } from "@mesaflow/shared";
import type { z } from "zod";
import { AdminGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { PlansService } from "./plans.service.js";

const id = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** Público: os planos ativos, para o site. */
@Controller("plans")
export class PublicPlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.publicList();
  }
}

/** Equipe MesaFlow: catálogo de planos. */
@Controller("admin/plans")
@UseGuards(AdminGuard)
export class AdminPlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.adminList();
  }

  @Post()
  create(@Body(new ZodValidationPipe(planInputSchema)) body: z.output<typeof planInputSchema>) {
    return this.plans.create(body);
  }

  // Antes de ":id" para "order" não ser lido como id.
  @Put("order")
  reorder(@Body(new ZodValidationPipe(planOrderSchema)) body: z.output<typeof planOrderSchema>) {
    return this.plans.reorder(body.ids);
  }

  @Put(":id")
  update(@Param("id", id) planId: string, @Body(new ZodValidationPipe(planInputSchema)) body: z.output<typeof planInputSchema>) {
    return this.plans.update(planId, body);
  }
}
