import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  mergeSchema,
  reasonSchema,
  serviceFeeSchema,
  tabOpenSchema,
  tabPaymentInputSchema,
  tabRoundInputSchema,
  transferSchema,
  type MemberProfile,
} from "@mesaflow/shared";
import { z } from "zod";
import { CurrentMember, RequirePermission } from "../../auth/auth-context.js";
import { MemberGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { TabsService } from "./tabs.service.js";
import { ModuloGuard, RequireModule } from "../plan-limits/modulo.guard.js";

const uuid = new ParseUUIDPipe({ version: "4" });
const mesa = new ZodValidationPipe(z.coerce.number().int().min(1, "Mesa de 1 a 999").max(999, "Mesa de 1 a 999"));
const filtro = z.object({ scope: z.enum(["abertas", "hoje"]).default("abertas") });
const corpo = <S extends z.ZodType>(s: S) => new ZodValidationPipe(s);

@Controller("tabs")
@UseGuards(MemberGuard, ModuloGuard)
@RequireModule("tabs")
export class TabsController {
  constructor(private readonly tabs: TabsService) {}

  @Get()
  @RequirePermission("tabs.view")
  list(@CurrentMember() m: MemberProfile, @Query(corpo(filtro)) q: z.output<typeof filtro>) {
    return this.tabs.list(m.company.id, q.scope);
  }

  @Get(":id")
  @RequirePermission("tabs.view")
  detail(@CurrentMember() m: MemberProfile, @Param("id", uuid) id: string) {
    return this.tabs.detail(m.company.id, id);
  }

  @Post()
  @RequirePermission("tabs.open")
  open(@CurrentMember() m: MemberProfile, @Body(corpo(tabOpenSchema)) body: z.output<typeof tabOpenSchema>) {
    return this.tabs.open(m.company.id, m.member.id, body);
  }

  /** Balcão: lança na mesa pelo número; abre a comanda se a mesa estiver livre. */
  @Post("table/:tableNumber/rounds")
  @RequirePermission("tabs.open")
  roundForTable(
    @CurrentMember() m: MemberProfile,
    @Param("tableNumber", mesa) tableNumber: number,
    @Body(corpo(tabRoundInputSchema)) body: z.output<typeof tabRoundInputSchema>,
  ) {
    return this.tabs.roundForTable(m.company.id, m.member.id, tableNumber, body);
  }

  @Post(":id/rounds")
  @RequirePermission("tabs.open")
  round(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(corpo(tabRoundInputSchema)) body: z.output<typeof tabRoundInputSchema>,
  ) {
    return this.tabs.addRound(m.company.id, m.member.id, id, body);
  }

  @Post(":id/items/:itemId/cancel")
  @HttpCode(200)
  @RequirePermission("orders.cancel")
  cancelItem(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Param("itemId", uuid) itemId: string,
    @Body(corpo(reasonSchema)) body: z.output<typeof reasonSchema>,
  ) {
    return this.tabs.cancelItem(m.company.id, m.member.id, id, itemId, body.reason);
  }

  @Post(":id/rounds/:orderId/transfer")
  @HttpCode(200)
  @RequirePermission("tabs.transfer")
  transfer(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Param("orderId", uuid) orderId: string,
    @Body(corpo(transferSchema)) body: z.output<typeof transferSchema>,
  ) {
    return this.tabs.transferRound(m.company.id, m.member.id, id, orderId, body.toTabId);
  }

  @Post(":id/merge")
  @HttpCode(200)
  @RequirePermission("tabs.transfer")
  merge(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(corpo(mergeSchema)) body: z.output<typeof mergeSchema>,
  ) {
    return this.tabs.merge(m.company.id, m.member.id, id, body.intoTabId);
  }

  @Patch(":id/service-fee")
  @RequirePermission("tabs.close")
  fee(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(corpo(serviceFeeSchema)) body: z.output<typeof serviceFeeSchema>,
  ) {
    return this.tabs.setServiceFee(m.company.id, m.member.id, id, body.serviceFeeBps);
  }

  @Post(":id/payments")
  @RequirePermission("tabs.close")
  pay(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(corpo(tabPaymentInputSchema)) body: z.output<typeof tabPaymentInputSchema>,
  ) {
    return this.tabs.pay(m.company.id, m.member.id, id, body);
  }

  @Post(":id/payments/:paymentId/void")
  @HttpCode(200)
  @RequirePermission("tabs.close")
  voidPayment(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Param("paymentId", uuid) paymentId: string,
    @Body(corpo(reasonSchema)) body: z.output<typeof reasonSchema>,
  ) {
    return this.tabs.voidPayment(m.company.id, m.member.id, id, paymentId, body.reason);
  }

  @Post(":id/close")
  @HttpCode(200)
  @RequirePermission("tabs.close")
  close(@CurrentMember() m: MemberProfile, @Param("id", uuid) id: string) {
    return this.tabs.close(m.company.id, m.member.id, id);
  }

  @Post(":id/reopen")
  @HttpCode(200)
  @RequirePermission("tabs.reopen")
  reopen(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(corpo(reasonSchema)) body: z.output<typeof reasonSchema>,
  ) {
    return this.tabs.reopen(m.company.id, m.member.id, id, body.reason);
  }

  @Post(":id/call/answer")
  @HttpCode(200)
  @RequirePermission("tabs.view")
  answerCall(@CurrentMember() m: MemberProfile, @Param("id", uuid) id: string) {
    return this.tabs.answerCall(m.company.id, m.member.id, id);
  }
}
