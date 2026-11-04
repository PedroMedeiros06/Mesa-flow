import { Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { LimiteChamadosGuard } from "./limite-chamados.guard.js";
import { TableQrService } from "./table-qr.service.js";

const token = new ZodValidationPipe(z.string().regex(/^[A-Za-z0-9_-]{22}$/, "QR code inválido"));

/** Sem login: qualquer pessoa com o QR da mesa. */
@Controller("table/:token")
export class PublicTableController {
  constructor(private readonly qr: TableQrService) {}

  @Get()
  view(@Param("token", token) t: string) {
    return this.qr.view(t);
  }

  @Post("call")
  @UseGuards(LimiteChamadosGuard)
  async call(@Param("token", token) t: string, @Res({ passthrough: true }) res: Response) {
    const { calledAt, created } = await this.qr.call(t);
    res.status(created ? 201 : 200);
    return { calledAt };
  }
}
