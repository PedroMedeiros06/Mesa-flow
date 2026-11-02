import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { storefrontOrderInputSchema } from "@mesaflow/shared";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { LimitePedidosGuard } from "./limite.guard.js";
import { StorefrontService } from "./storefront.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });
const codigo = new ZodValidationPipe(z.string().regex(/^\d{6}$/, "Código inválido"));

/** Sem login: qualquer pessoa com o link do restaurante. */
@Controller("storefront/:code")
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get()
  show(@Param("code", codigo) code: string) {
    return this.storefront.show(code);
  }

  @Post("orders")
  @UseGuards(LimitePedidosGuard)
  async order(
    @Param("code", codigo) code: string,
    @Body(new ZodValidationPipe(storefrontOrderInputSchema)) body: z.output<typeof storefrontOrderInputSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { order, created } = await this.storefront.order(code, body);
    res.status(created ? 201 : 200);
    return order;
  }

  @Get("orders/:id")
  track(@Param("code", codigo) code: string, @Param("id", uuid) id: string) {
    return this.storefront.track(code, id);
  }
}
