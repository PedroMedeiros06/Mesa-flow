import { Injectable } from "@nestjs/common";
import type { SessionTokens } from "@mesaflow/shared";
import { supabaseConfig } from "../config/env.js";

export interface AuthSession extends SessionTokens {
  userId: string;
}

interface GoTrueTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in: number;
  user: { id: string };
}

// Chamadas ao Supabase Auth (GoTrue) pela API REST, com a chave publicável.
@Injectable()
export class SupabaseAuthClient {
  private readonly config = supabaseConfig();

  /** null quando e-mail ou senha estão errados. */
  async signInWithPassword(email: string, password: string): Promise<AuthSession | null> {
    return this.token("password", { email, password });
  }

  /** null quando o refresh token é inválido ou já foi usado. */
  async refresh(refreshToken: string): Promise<AuthSession | null> {
    return this.token("refresh_token", { refresh_token: refreshToken });
  }

  /** Encerra a sessão do token informado. Erros são ignorados: o token expira de qualquer jeito. */
  async signOut(accessToken: string): Promise<void> {
    await fetch(`${this.config.authUrl}/logout?scope=local`, {
      method: "POST",
      headers: { apikey: this.config.publishableKey, Authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined);
  }

  /** Troca o token do link de senha por uma sessão. null quando o link é inválido, vencido ou já usado. */
  async verifyPasswordToken(tokenHash: string): Promise<AuthSession | null> {
    const res = await fetch(`${this.config.authUrl}/verify`, {
      method: "POST",
      headers: { apikey: this.config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recovery", token_hash: tokenHash }),
    });
    if (res.status === 400 || res.status === 403 || res.status === 404) return null;
    if (!res.ok) throw new Error(`Supabase Auth respondeu ${res.status} em /verify`);
    return sessao((await res.json()) as GoTrueTokenResponse);
  }

  /** Grava a senha nova. Devolve a mensagem de recusa (senha fraca, igual à anterior) ou null quando deu certo. */
  async updatePassword(accessToken: string, password: string): Promise<string | null> {
    const res = await fetch(`${this.config.authUrl}/user`, {
      method: "PUT",
      headers: { apikey: this.config.publishableKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) return null;
    const corpo = (await res.json().catch(() => ({}))) as { error_code?: string };
    if (corpo.error_code === "same_password") return "A senha nova precisa ser diferente da anterior.";
    if (corpo.error_code === "weak_password") return "Senha fraca. Use uma senha mais longa e difícil de adivinhar.";
    throw new Error(`Supabase Auth respondeu ${res.status} ao trocar a senha.`);
  }

  private async token(grantType: string, body: object): Promise<AuthSession | null> {
    const res = await fetch(`${this.config.authUrl}/token?grant_type=${grantType}`, {
      method: "POST",
      headers: { apikey: this.config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // 400 = credencial ou refresh token inválido. Outros erros (ex.: 401 por chave da API errada)
    // são falha de configuração e não podem virar "senha incorreta".
    if (res.status === 400) return null;
    if (!res.ok) throw new Error(`Supabase Auth respondeu ${res.status} em grant_type=${grantType}`);
    return sessao((await res.json()) as GoTrueTokenResponse);
  }
}

function sessao(data: GoTrueTokenResponse): AuthSession {
  return {
    userId: data.user.id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at ?? Math.floor(Date.now() / 1000) + data.expires_in,
  };
}
