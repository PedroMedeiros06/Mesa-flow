import {
  publicOrderSchema,
  publicTabSchema,
  waiterCallResponseSchema,
  storefrontSchema,
  type PublicOrder,
  type PublicTab,
  type Storefront,
  type StorefrontOrderInput,
} from "@mesaflow/shared";
import type { z } from "zod";
import { enviar, erroDaResposta, json } from "@/lib/http";

// Vitrine é pública: sem sessão, sem token. Cada resposta passa pelo schema do shared.
async function chamar<S extends z.ZodType>(schema: S, caminho: string, init?: RequestInit): Promise<z.output<S>> {
  const res = await enviar(fetch, caminho, init);
  if (!res.ok) throw await erroDaResposta(res);
  return schema.parse(await res.json());
}

export const apiLoja = {
  abrir(codigo: string): Promise<Storefront> {
    return chamar(storefrontSchema, `/storefront/${codigo}`);
  },
  pedir(codigo: string, dados: StorefrontOrderInput): Promise<PublicOrder> {
    return chamar(publicOrderSchema, `/storefront/${codigo}/orders`, json(dados));
  },
  acompanhar(codigo: string, id: string): Promise<PublicOrder> {
    return chamar(publicOrderSchema, `/storefront/${codigo}/orders/${id}`);
  },
  /** Página do QR da mesa. */
  mesa(token: string): Promise<PublicTab> {
    return chamar(publicTabSchema, `/table/${token}`);
  },
  chamarGarcom(token: string): Promise<{ calledAt: string }> {
    return chamar(waiterCallResponseSchema, `/table/${token}/call`, { method: "POST" });
  },
};
