import { HttpException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** Pedidos por IP e restaurante numa janela de tempo. */
export const LIMITE_PEDIDOS = 8;
export const JANELA_MS = 10 * 60_000;

/**
 * Freio simples contra robô enchendo a cozinha de pedidos falsos pela vitrine.
 * Fica na memória do processo: basta para um servidor só; com vários, vira Redis.
 */
@Injectable()
export class LimitePedidosGuard implements CanActivate {
  private readonly tentativas = new Map<string, number[]>();

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const chave = `${req.ip ?? "?"}|${String(req.params.code)}`;
    const agora = Date.now();
    const recentes = (this.tentativas.get(chave) ?? []).filter((t) => agora - t < JANELA_MS);
    if (recentes.length >= LIMITE_PEDIDOS) {
      throw new HttpException(
        { statusCode: 429, message: "Muitos pedidos seguidos deste aparelho. Espere alguns minutos ou fale com o restaurante." },
        429,
      );
    }
    recentes.push(agora);
    this.tentativas.set(chave, recentes);
    // Limpa chaves velhas de vez em quando para o mapa não crescer para sempre.
    if (this.tentativas.size > 5000) {
      for (const [k, v] of this.tentativas) if (v.every((t) => agora - t >= JANELA_MS)) this.tentativas.delete(k);
    }
    return true;
  }
}
