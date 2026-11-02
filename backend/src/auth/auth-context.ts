import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AdminProfile, MemberProfile, Permission } from "@mesaflow/shared";

// O que os guards deixam na requisição depois de autenticar.
// O restaurante sempre vem daqui (lido do banco), nunca do corpo ou da URL.
export interface AuthenticatedRequest extends Request {
  member?: MemberProfile;
  admin?: AdminProfile;
  accessToken?: string;
}

export const PERMISSION_KEY = "mesaflow:permission";

/** Exige uma permissão do restaurante na rota. O dono sempre passa. */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);

/** Perfil do membro autenticado (use em rotas protegidas por MemberGuard). */
export const CurrentMember = createParamDecorator((_: unknown, ctx: ExecutionContext): MemberProfile => {
  const member = ctx.switchToHttp().getRequest<AuthenticatedRequest>().member;
  if (!member) throw new Error("CurrentMember usado em rota sem MemberGuard.");
  return member;
});

/** Perfil do admin autenticado (use em rotas protegidas por AdminGuard). */
export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): AdminProfile => {
  const admin = ctx.switchToHttp().getRequest<AuthenticatedRequest>().admin;
  if (!admin) throw new Error("CurrentAdmin usado em rota sem AdminGuard.");
  return admin;
});

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}
