import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { can, type Permission } from "@mesaflow/shared";
import { bearerToken, PERMISSION_KEY, type AuthenticatedRequest } from "./auth-context.js";
import { IdentityRepository } from "./identity.repository.js";
import { TokenVerifier } from "./token-verifier.js";

const SESSAO_INVALIDA = "Sessão inválida ou expirada. Entre novamente.";

// Rotas do painel do restaurante. Relê membro e restaurante do banco a cada requisição,
// então bloqueio e mudança de permissão valem na hora, sem esperar o token expirar.
@Injectable()
export class MemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly identities: IdentityRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(req);
    const verified = token ? await this.verifier.verify(token) : null;
    if (!token || !verified) throw new UnauthorizedException(SESSAO_INVALIDA);

    const identity = await this.identities.findMemberByAuthUser(verified.userId);
    if (!identity) throw new UnauthorizedException(SESSAO_INVALIDA);
    if (!identity.companyActive) {
      throw new ForbiddenException(
        identity.blockedReason ? `Restaurante bloqueado: ${identity.blockedReason}` : "Restaurante bloqueado.",
      );
    }
    if (!identity.memberActive) throw new ForbiddenException("Seu acesso foi bloqueado pelo restaurante.");

    const needed = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const { member } = identity.profile;
    if (needed && !can(member.role, member.permissions, needed)) {
      throw new ForbiddenException("Você não tem permissão para esta ação.");
    }

    req.member = identity.profile;
    req.accessToken = token;
    return true;
  }
}

// Rotas da equipe MesaFlow.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly verifier: TokenVerifier,
    private readonly identities: IdentityRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(req);
    const verified = token ? await this.verifier.verify(token) : null;
    if (!token || !verified) throw new UnauthorizedException(SESSAO_INVALIDA);

    const admin = await this.identities.findAdminByAuthUser(verified.userId);
    if (!admin) throw new ForbiddenException("Área restrita à equipe MesaFlow.");

    req.admin = admin;
    req.accessToken = token;
    return true;
  }
}
