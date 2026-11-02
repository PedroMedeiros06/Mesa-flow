import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { TokenVerifier } from "../auth/token-verifier.js";

export const ISSUER_TESTE = "https://teste.supabase.co/auth/v1";

/** Par de chaves ES256 local: assina tokens iguais aos do Supabase Auth, sem rede. */
export async function criarEmissorDeTokens() {
  const par = await generateKeyPair("ES256", { extractable: true });
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(par.publicKey)), kid: "teste", alg: "ES256" }] });
  const verifier = new TokenVerifier(ISSUER_TESTE, jwks);

  const token = (sub: string, opts: { issuer?: string; expiresIn?: string } = {}) =>
    new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: "teste" })
      .setSubject(sub)
      .setIssuer(opts.issuer ?? ISSUER_TESTE)
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? "1h")
      .sign(par.privateKey);

  return { verifier, token };
}
