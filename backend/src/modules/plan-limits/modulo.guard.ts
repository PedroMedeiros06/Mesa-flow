import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PlanModule } from "@mesaflow/shared";
import type { AuthenticatedRequest } from "../../auth/auth-context.js";
import { PlanLimitsService } from "./plan-limits.service.js";

const MODULO_KEY = "mesaflow:plan-module";

/** Exige que o plano do restaurante inclua o recurso. Use depois do MemberGuard. */
export const RequireModule = (modulo: PlanModule) => SetMetadata(MODULO_KEY, modulo);

@Injectable()
export class ModuloGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limites: PlanLimitsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const modulo = this.reflector.getAllAndOverride<PlanModule | undefined>(MODULO_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!modulo) return true;
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.member) throw new Error("ModuloGuard usado sem MemberGuard antes.");
    await this.limites.exigirModulo(req.member.company.id, modulo);
    return true;
  }
}
