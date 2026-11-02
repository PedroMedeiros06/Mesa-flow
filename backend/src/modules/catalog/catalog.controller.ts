import {
  Body,
  Catch,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import {
  categoryInputSchema,
  MAX_IMAGE_BYTES,
  productInputSchema,
  reorderSchema,
  type MemberProfile,
} from "@mesaflow/shared";
import type { z } from "zod";
import { CurrentMember, RequirePermission } from "../../auth/auth-context.js";
import { MemberGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { CatalogService } from "./catalog.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });

// O multer recusa o arquivo grande antes de ler tudo; aqui só trocamos a mensagem.
@Catch(PayloadTooLargeException)
class FotoGrandeFilter implements ExceptionFilter {
  catch(_: PayloadTooLargeException, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(413)
      .json({ statusCode: 413, message: `A foto passa de ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Envie uma menor.` });
  }
}

// O restaurante sai sempre da sessão (CurrentMember), nunca da URL ou do corpo.
@Controller("catalog")
@UseGuards(MemberGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // Qualquer pessoa da equipe lê o cardápio: balcão e mesas precisam dele para lançar pedidos.
  @Get()
  list(@CurrentMember() m: MemberProfile) {
    return this.catalog.catalog(m.company.id);
  }

  @Get("ingredient-options")
  @RequirePermission("catalog.manage")
  ingredientOptions(@CurrentMember() m: MemberProfile) {
    return this.catalog.ingredientOptions(m.company.id);
  }

  // ---------- categorias ----------

  @Post("categories")
  @RequirePermission("catalog.manage")
  createCategory(
    @CurrentMember() m: MemberProfile,
    @Body(new ZodValidationPipe(categoryInputSchema)) body: z.output<typeof categoryInputSchema>,
  ) {
    return this.catalog.createCategory(m.company.id, body);
  }

  @Put("categories/order")
  @HttpCode(204)
  @RequirePermission("catalog.manage")
  async reorderCategories(
    @CurrentMember() m: MemberProfile,
    @Body(new ZodValidationPipe(reorderSchema)) body: z.output<typeof reorderSchema>,
  ) {
    await this.catalog.reorderCategories(m.company.id, body.ids);
  }

  @Patch("categories/:id")
  @RequirePermission("catalog.manage")
  updateCategory(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(categoryInputSchema)) body: z.output<typeof categoryInputSchema>,
  ) {
    return this.catalog.updateCategory(m.company.id, id, body);
  }

  @Delete("categories/:id")
  @HttpCode(204)
  @RequirePermission("catalog.manage")
  async deleteCategory(@CurrentMember() m: MemberProfile, @Param("id", uuid) id: string) {
    await this.catalog.deleteCategory(m.company.id, id);
  }

  @Put("categories/:id/products/order")
  @HttpCode(204)
  @RequirePermission("catalog.manage")
  async reorderProducts(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(reorderSchema)) body: z.output<typeof reorderSchema>,
  ) {
    await this.catalog.reorderProducts(m.company.id, id, body.ids);
  }

  // ---------- produtos ----------

  @Post("products")
  @RequirePermission("catalog.manage")
  createProduct(
    @CurrentMember() m: MemberProfile,
    @Body(new ZodValidationPipe(productInputSchema)) body: z.output<typeof productInputSchema>,
  ) {
    return this.catalog.createProduct(m.company.id, body);
  }

  @Patch("products/:id")
  @RequirePermission("catalog.manage")
  updateProduct(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(productInputSchema)) body: z.output<typeof productInputSchema>,
  ) {
    return this.catalog.updateProduct(m.company.id, id, body);
  }

  @Delete("products/:id")
  @HttpCode(204)
  @RequirePermission("catalog.manage")
  async deleteProduct(@CurrentMember() m: MemberProfile, @Param("id", uuid) id: string) {
    await this.catalog.deleteProduct(m.company.id, id);
  }

  // ---------- fotos ----------

  @Post("products/:id/images")
  @RequirePermission("catalog.manage")
  @UseFilters(FotoGrandeFilter)
  @UseInterceptors(FileInterceptor("foto", { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  addImage(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @UploadedFile() foto: Express.Multer.File | undefined,
  ) {
    return this.catalog.addImage(m.company.id, id, foto?.buffer);
  }

  @Delete("products/:id/images/:imageId")
  @RequirePermission("catalog.manage")
  removeImage(
    @CurrentMember() m: MemberProfile,
    @Param("id", uuid) id: string,
    @Param("imageId", uuid) imageId: string,
  ) {
    return this.catalog.removeImage(m.company.id, id, imageId);
  }
}
