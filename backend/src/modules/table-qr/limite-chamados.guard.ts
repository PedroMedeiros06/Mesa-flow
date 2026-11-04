import { HttpException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** Chamados por IP e QR numa janela de tempo. */
export const LIMITE_CHAMADOS = 10;
export const JANELA_CHAMADOS_MS = 10 * 60_000;

/**
 * Freio contra robô apertando "chamar o garçom" sem parar (o minuto de espera entre chamados já
 * segura o cliente comum). Fica na memória do processo, como o limite de pedidos da vitrine.
 */
@Injectable()
export class LimiteChamadosGuard implements CanActivate {
  private readonly tentativas = new Map<string, number[]>();

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const chave = `${req.ip ?? "?"}|${String(req.params.token)}`;
    const agora = Date.now();
    const recentes = (this.tentativas.get(chave) ?? []).filter((t) => agora - t < JANELA_CHAMADOS_MS);
    if (recentes.length >= LIMITE_CHAMADOS) {
      throw new HttpException({ statusCode: 429, message: "Muitos chamados seguidos. O garçom já foi avisado." }, 429);
    }
    recentes.push(agora);
    this.tentativas.set(chave, recentes);
    if (this.tentativas.size > 5000) {
      for (const [k, v] of this.tentativas) if (v.every((t) => agora - t >= JANELA_CHAMADOS_MS)) this.tentativas.delete(k);
    }
    return true;
  }
}
