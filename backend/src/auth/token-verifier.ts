import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { supabaseConfig } from "../config/env.js";

export interface VerifiedToken {
  userId: string;
}

// Confere o access token do Supabase Auth localmente, com as chaves públicas (JWKS) do projeto.
// Não faz chamada de rede por requisição: o jose guarda as chaves em cache.
// Os testes criam a instância com um par de chaves local no lugar do JWKS.
export class TokenVerifier {
  constructor(
    private readonly issuer: string,
    private readonly getKey: JWTVerifyGetKey,
  ) {}

  static fromSupabase(): TokenVerifier {
    const { authUrl } = supabaseConfig();
    return new TokenVerifier(authUrl, createRemoteJWKSet(new URL(`${authUrl}/.well-known/jwks.json`)));
  }

  /** Devolve null para qualquer token inválido, expirado ou de outro emissor. */
  async verify(token: string): Promise<VerifiedToken | null> {
    try {
      const { payload } = await jwtVerify(token, this.getKey, {
        issuer: this.issuer,
        audience: "authenticated",
        algorithms: ["ES256"],
      });
      return payload.sub ? { userId: payload.sub } : null;
    } catch {
      return null;
    }
  }
}
