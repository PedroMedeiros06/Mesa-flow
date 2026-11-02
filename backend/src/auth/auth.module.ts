import { Global, Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AdminAuthController, AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AdminGuard, MemberGuard } from "./guards.js";
import { DrizzleIdentityRepository, IdentityRepository } from "./identity.repository.js";
import { SupabaseAuthClient } from "./supabase-auth.client.js";
import { TokenVerifier } from "./token-verifier.js";

// Global: os outros módulos usam MemberGuard/AdminGuard sem importar nada.
@Global()
@Module({
  // Rotas de login: no máximo 10 tentativas por minuto por IP.
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
  controllers: [AuthController, AdminAuthController],
  providers: [
    AuthService,
    SupabaseAuthClient,
    MemberGuard,
    AdminGuard,
    { provide: TokenVerifier, useFactory: () => TokenVerifier.fromSupabase() },
    { provide: IdentityRepository, useClass: DrizzleIdentityRepository },
  ],
  exports: [MemberGuard, AdminGuard, TokenVerifier, IdentityRepository],
})
export class AuthModule {}
