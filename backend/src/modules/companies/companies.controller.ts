import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { companySettingsInputSchema, type MemberProfile } from "@mesaflow/shared";
import type { z } from "zod";
import { CurrentMember, RequirePermission } from "../../auth/auth-context.js";
import { MemberGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { PlanLimitsService } from "../plan-limits/plan-limits.service.js";
import { CompaniesService } from "./companies.service.js";

@Controller("company")
@UseGuards(MemberGuard)
@RequirePermission("company.manage")
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly limites: PlanLimitsService,
  ) {}

  @Get()
  get(@CurrentMember() m: MemberProfile) {
    return this.companies.get(m.company.id);
  }

  /** Plano, limites (com os pacotes à parte) e uso atual, para a tela Ajustes. */
  @Get("plan")
  plan(@CurrentMember() m: MemberProfile) {
    return this.limites.doRestaurante(m.company.id);
  }

  @Put()
  update(
    @CurrentMember() m: MemberProfile,
    @Body(new ZodValidationPipe(companySettingsInputSchema)) body: z.output<typeof companySettingsInputSchema>,
  ) {
    return this.companies.update(m.company.id, body);
  }
}
