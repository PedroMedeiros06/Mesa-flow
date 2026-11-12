import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { memberCreateSchema, memberUpdateSchema, type MemberProfile } from "@mesaflow/shared";
import type { z } from "zod";
import { CurrentMember, RequirePermission } from "../../auth/auth-context.js";
import { MemberGuard } from "../../auth/guards.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { MembersService } from "./members.service.js";

const id = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@Controller("members")
@UseGuards(MemberGuard)
@RequirePermission("members.manage")
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@CurrentMember() m: MemberProfile) {
    return this.members.list(m.company.id);
  }

  @Post()
  create(
    @CurrentMember() m: MemberProfile,
    @Body(new ZodValidationPipe(memberCreateSchema)) body: z.output<typeof memberCreateSchema>,
  ) {
    return this.members.create(m, body);
  }

  @Patch(":id")
  update(
    @CurrentMember() m: MemberProfile,
    @Param("id", id) memberId: string,
    @Body(new ZodValidationPipe(memberUpdateSchema)) body: z.output<typeof memberUpdateSchema>,
  ) {
    return this.members.update(m, memberId, body);
  }

  @Post(":id/password-link")
  passwordLink(@CurrentMember() m: MemberProfile, @Param("id", id) memberId: string) {
    return this.members.passwordLink(m, memberId);
  }
}
