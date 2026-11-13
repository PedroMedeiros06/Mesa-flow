import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  billingQuerySchema,
  generateInvoicesSchema,
  payInvoiceSchema,
  subscriptionInputSchema,
  type AdminProfile,
  type MemberProfile,
} from "@mesaflow/shared";
import type { z } from "zod";
import { CurrentAdmin, CurrentMember, RequirePermission } from "../../auth/auth-context.js";
import { AdminGuard, MemberGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { BillingService } from "./billing.service.js";

const id = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** Equipe MesaFlow: planos, faturas do mês e baixa de pagamento. */
@Controller("admin")
@UseGuards(AdminGuard)
export class AdminBillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("billing")
  month(@Query(new ZodValidationPipe(billingQuerySchema)) q: z.output<typeof billingQuerySchema>) {
    return this.billing.month(q.month);
  }

  @Post("billing/generate")
  @HttpCode(200)
  generate(@Body(new ZodValidationPipe(generateInvoicesSchema)) body: z.output<typeof generateInvoicesSchema>) {
    return this.billing.generate(body.month);
  }

  @Put("companies/:id/subscription")
  setSubscription(
    @Param("id", id) companyId: string,
    @Body(new ZodValidationPipe(subscriptionInputSchema)) body: z.output<typeof subscriptionInputSchema>,
  ) {
    return this.billing.setSubscription(companyId, body);
  }

  @Post("invoices/:id/pay")
  @HttpCode(200)
  pay(
    @CurrentAdmin() a: AdminProfile,
    @Param("id", id) invoiceId: string,
    @Body(new ZodValidationPipe(payInvoiceSchema)) body: z.output<typeof payInvoiceSchema>,
  ) {
    return this.billing.pay(invoiceId, a.admin.id, body);
  }

  @Post("invoices/:id/cancel")
  @HttpCode(200)
  cancel(@CurrentAdmin() a: AdminProfile, @Param("id", id) invoiceId: string) {
    return this.billing.cancel(invoiceId, a.admin.id);
  }

  @Post("invoices/:id/reopen")
  @HttpCode(200)
  reopen(@CurrentAdmin() a: AdminProfile, @Param("id", id) invoiceId: string) {
    return this.billing.reopen(invoiceId, a.admin.id);
  }
}

/** Restaurante: aviso de mensalidade atrasada, só para quem cuida dos dados do restaurante. */
@Controller("billing")
@UseGuards(MemberGuard)
export class BillingStatusController {
  constructor(private readonly billing: BillingService) {}

  @Get("status")
  @RequirePermission("company.manage")
  status(@CurrentMember() m: MemberProfile) {
    return this.billing.status(m.company.id);
  }
}
