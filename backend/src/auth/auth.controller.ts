import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  adminLoginSchema,
  refreshSchema,
  restaurantLoginSchema,
  setPasswordSchema,
  type AdminProfile,
  type AdminSession,
  type MemberProfile,
  type MemberSession,
  type SessionTokens,
  type SetPasswordResult,
} from "@mesaflow/shared";
import type { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { CurrentAdmin, CurrentMember, type AuthenticatedRequest } from "./auth-context.js";
import { AuthService } from "./auth.service.js";
import { AdminGuard, MemberGuard } from "./guards.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  login(
    @Body(new ZodValidationPipe(restaurantLoginSchema)) body: z.output<typeof restaurantLoginSchema>,
  ): Promise<MemberSession> {
    return this.auth.loginMember(body.companyCode, body.cpf, body.password);
  }

  // Serve tanto para o restaurante quanto para o admin: só troca os tokens.
  @Post("refresh")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: z.output<typeof refreshSchema>): Promise<SessionTokens> {
    return this.auth.refresh(body.refreshToken);
  }

  // Público: quem chega pelo link de convite ou de troca de senha ainda não tem sessão.
  @Post("password")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  setPassword(
    @Body(new ZodValidationPipe(setPasswordSchema)) body: z.output<typeof setPasswordSchema>,
  ): Promise<SetPasswordResult> {
    return this.auth.setPassword(body.token, body.password);
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(MemberGuard)
  async logout(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.auth.logout(req.accessToken!);
  }

  @Get("me")
  @UseGuards(MemberGuard)
  me(@CurrentMember() member: MemberProfile): MemberProfile {
    return member;
  }
}

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  login(@Body(new ZodValidationPipe(adminLoginSchema)) body: z.output<typeof adminLoginSchema>): Promise<AdminSession> {
    return this.auth.loginAdmin(body.email, body.password);
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async logout(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.auth.logout(req.accessToken!);
  }

  @Get("me")
  @UseGuards(AdminGuard)
  me(@CurrentAdmin() admin: AdminProfile): AdminProfile {
    return admin;
  }
}
