import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { dashboardQuerySchema, type DashboardSummary, type MemberProfile } from "@mesaflow/shared";
import type { z } from "zod";
import { CurrentMember, RequirePermission } from "../../auth/auth-context.js";
import { MemberGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
@UseGuards(MemberGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  @RequirePermission("reports.view")
  summary(
    @CurrentMember() m: MemberProfile,
    @Query(new ZodValidationPipe(dashboardQuerySchema)) q: z.output<typeof dashboardQuerySchema>,
  ): Promise<DashboardSummary> {
    return this.dashboard.summary(m.company.id, q.date);
  }
}
