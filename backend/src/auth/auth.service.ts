import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AdminSession, MemberSession, SessionTokens, SetPasswordResult } from "@mesaflow/shared";
import { IdentityRepository } from "./identity.repository.js";
import { SupabaseAuthClient } from "./supabase-auth.client.js";

// Mesma mensagem para código, CPF ou senha errados: a API não revela quais restaurantes ou CPFs existem.
const CREDENCIAIS_INVALIDAS = "Código, CPF ou senha incorretos.";

@Injectable()
export class AuthService {
  constructor(
    private readonly identities: IdentityRepository,
    private readonly supabase: SupabaseAuthClient,
  ) {}

  async loginMember(companyCode: string, cpf: string, password: string): Promise<MemberSession> {
    const email = await this.identities.findLoginEmail(companyCode, cpf);
    if (!email) throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);

    const session = await this.supabase.signInWithPassword(email, password);
    if (!session) throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);

    // Só depois da senha certa a API conta que o acesso está bloqueado.
    const identity = await this.identities.findMemberByAuthUser(session.userId);
    const motivo = !identity
      ? CREDENCIAIS_INVALIDAS
      : !identity.companyActive
        ? identity.blockedReason
          ? `Restaurante bloqueado: ${identity.blockedReason}`
          : "Restaurante bloqueado."
        : !identity.memberActive
          ? "Seu acesso foi bloqueado pelo restaurante."
          : null;
    if (!identity || motivo) {
      await this.supabase.signOut(session.accessToken);
      throw identity ? new ForbiddenException(motivo) : new UnauthorizedException(motivo);
    }

    return { ...tokens(session), profile: identity.profile };
  }

  async loginAdmin(email: string, password: string): Promise<AdminSession> {
    const session = await this.supabase.signInWithPassword(email, password);
    if (!session) throw new UnauthorizedException("E-mail ou senha incorretos.");

    const profile = await this.identities.findAdminByAuthUser(session.userId);
    if (!profile) {
      await this.supabase.signOut(session.accessToken);
      throw new UnauthorizedException("E-mail ou senha incorretos.");
    }
    return { ...tokens(session), profile };
  }

  async refresh(refreshToken: string): Promise<SessionTokens> {
    const session = await this.supabase.refresh(refreshToken);
    if (!session) throw new UnauthorizedException("Sessão expirada. Entre novamente.");
    return tokens(session);
  }

  /** Página /senha: o link (convite ou troca de senha) vale uma vez; a sessão aberta por ele é encerrada no fim. */
  async setPassword(token: string, password: string): Promise<SetPasswordResult> {
    const session = await this.supabase.verifyPasswordToken(token);
    if (!session) throw new BadRequestException("Este link não vale mais. Peça um link novo ao responsável pela equipe.");
    try {
      const identity = await this.identities.findMemberByAuthUser(session.userId);
      if (!identity) throw new BadRequestException("Este link não vale mais. Peça um link novo ao responsável pela equipe.");
      if (!identity.memberActive) throw new ForbiddenException("Seu acesso foi bloqueado pelo restaurante.");
      const recusa = await this.supabase.updatePassword(session.accessToken, password);
      if (recusa) throw new BadRequestException(recusa);
      const { member, company } = identity.profile;
      return { name: member.name, companyCode: company.code, companyName: company.name };
    } finally {
      await this.supabase.signOut(session.accessToken);
    }
  }

  async logout(accessToken: string): Promise<void> {
    await this.supabase.signOut(accessToken);
  }
}

function tokens(s: SessionTokens): SessionTokens {
  return { accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt };
}
