import { Global, Module } from "@nestjs/common";
import { ModuloGuard } from "./modulo.guard.js";
import { PlanLimitsService } from "./plan-limits.service.js";

// Global: tabs, QR, estoque, vitrine, equipe e cardápio conferem limites sem importar nada.
@Global()
@Module({ providers: [PlanLimitsService, ModuloGuard], exports: [PlanLimitsService, ModuloGuard] })
export class PlanLimitsModule {}
