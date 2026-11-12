import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { companySettingsInputSchema, type MemberProfile } from "@mesaflow/shared";
import type { z } from "zod";
import { CurrentMember, RequirePermission } from "../../auth/auth-context.js";
import { MemberGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { CompaniesService } from "./companies.service.js";

@Controller("company")
@UseGuards(MemberGuard)
@RequirePermission("company.manage")
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  get(@CurrentMember() m: MemberProfile) {
    return this.companies.get(m.company.id);
  }

  @Put()
  update(
    @CurrentMember() m: MemberProfile,
    @Body(new ZodValidationPipe(companySettingsInputSchema)) body: z.output<typeof companySettingsInputSchema>,
  ) {
    return this.companies.update(m.company.id, body);
  }
}
