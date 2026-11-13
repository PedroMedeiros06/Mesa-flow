import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { addressSchema, adminCompanyCreateSchema, adminCompanyStatusSchema } from "@mesaflow/shared";
import type { z } from "zod";
import { AdminGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { AdminCompaniesService } from "./admin-companies.service.js";

const id = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** Só a equipe MesaFlow (platform_admins). */
@Controller("admin/companies")
@UseGuards(AdminGuard)
export class AdminCompaniesController {
  constructor(private readonly companies: AdminCompaniesService) {}

  @Get()
  list() {
    return this.companies.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(adminCompanyCreateSchema)) body: z.output<typeof adminCompanyCreateSchema>) {
    return this.companies.create(body);
  }

  @Put(":id/status")
  setStatus(
    @Param("id", id) companyId: string,
    @Body(new ZodValidationPipe(adminCompanyStatusSchema)) body: z.output<typeof adminCompanyStatusSchema>,
  ) {
    return this.companies.setStatus(companyId, body);
  }

  @Put(":id/address")
  setAddress(@Param("id", id) companyId: string, @Body(new ZodValidationPipe(addressSchema)) body: z.output<typeof addressSchema>) {
    return this.companies.setAddress(companyId, body);
  }

  @Post(":id/owner-link")
  ownerLink(@Param("id", id) companyId: string) {
    return this.companies.ownerLink(companyId);
  }
}
