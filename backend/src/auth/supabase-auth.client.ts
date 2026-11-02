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
    const data = (await res.json()) as GoTrueTokenResponse;
    return {
      userId: data.user.id,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at ?? Math.floor(Date.now() / 1000) + data.expires_in,
    };
  }
}
