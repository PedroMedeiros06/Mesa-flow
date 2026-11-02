import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import {
  cancelOrderSchema,
  orderInputSchema,
  statusChangeSchema,
  type MemberProfile,
  type StatusChange,
} from "@mesaflow/shared";
import { z } from "zod";
import { CurrentMember, RequirePermission } from "../../auth/auth-context.js";
import { MemberGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { OrdersService } from "./orders.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });
const filtroSchema = z.object({
  /** fila = cozinha (ainda não entregues); dia = todos de uma data. */
  scope: z.enum(["fila", "dia"]).default("fila"),
  date: z.iso.date().optional(),
});

@Controller("orders")
@UseGuards(MemberGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get("menu")
  @RequirePermission("orders.create")
  menu(@CurrentMember() m: MemberProfile) {
    return this.orders.menu(m.company.id);
  }

  @Get()
  @RequirePermission("orders.view")
  list(@CurrentMember() m: MemberProfile, @Query(new ZodValidationPipe(filtroSchema)) q: z.output<typeof filtroSchema>) {
    return q.scope === "fila" ? this.orders.queue(m.company.id) : this.orders.day(m.company.id, q.date);
  }

  @Get(":id")
  @RequirePermission("orders.view")
  get(@CurrentMember() m: MemberProfile, @Param("id", uuid) id: string) {
    return this.orders.get(m.company.id, id);
  }

  /** 201 para pedido novo; 200 quando o mesmo clientRequestId chega de novo (devolve o que já existe). */
  @Post()
  @RequirePermission("orders.create")
  async create(
    @CurrentMember() m: MemberProfile,
    @Body(new ZodValidationPipe(orderInputSchema)) body: z.output<typeof orderInputSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { order, created } = await this.orders.create(m, body);
    res.status(created ? 201 : 200);
    return order;
  }

  @Patch(":id/status")
  @RequirePermission("orders.change_status")
  status(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(statusChangeSchema)) body: StatusChange,
  ) {
    return this.orders.changeStatus(m.company.id, id, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermission("orders.cancel")
  cancel(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(cancelOrderSchema)) body: z.output<typeof cancelOrderSchema>,
  ) {
    return this.orders.cancel(m.company.id, m.member.id, id, body);
  }
}
