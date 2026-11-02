import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { isPermission, type AdminProfile, type MemberProfile } from "@mesaflow/shared";
import { DB, type Database } from "../db/database.module.js";
import { companies, members, platformAdmins } from "../db/schema.js";

export interface MemberIdentity {
  profile: MemberProfile;
  memberActive: boolean;
  companyActive: boolean;
  blockedReason: string | null;
}

// Consultas de identidade usadas pelo login e pelos guards.
// É uma classe abstrata para os testes trocarem por uma versão em memória.
export abstract class IdentityRepository {
  /** E-mail do Auth para o par código do restaurante + CPF. */
  abstract findLoginEmail(companyCode: string, cpf: string): Promise<string | null>;
  abstract findMemberByAuthUser(authUserId: string): Promise<MemberIdentity | null>;
  abstract findAdminByAuthUser(authUserId: string): Promise<AdminProfile | null>;
}

@Injectable()
export class DrizzleIdentityRepository extends IdentityRepository {
  constructor(@Inject(DB) private readonly db: Database | null) {
    super();
  }

  private get conn(): Database {
    if (!this.db) throw new Error("Banco não configurado (DATABASE_URL).");
    return this.db;
  }

  async findLoginEmail(companyCode: string, cpf: string): Promise<string | null> {
    const [row] = await this.conn
      .select({ email: members.email })
      .from(members)
      .innerJoin(companies, eq(companies.id, members.companyId))
      .where(and(eq(companies.code, companyCode), eq(members.cpf, cpf)))
      .limit(1);
    return row?.email ?? null;
  }

  async findMemberByAuthUser(authUserId: string): Promise<MemberIdentity | null> {
    const [row] = await this.conn
      .select({ member: members, company: companies })
      .from(members)
      .innerJoin(companies, eq(companies.id, members.companyId))
      .where(eq(members.authUserId, authUserId))
      .limit(1);
    if (!row) return null;
    const { member, company } = row;
    return {
      profile: {
        kind: "member",
        member: {
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          // Chaves desconhecidas no banco são ignoradas, nunca viram acesso.
          permissions: member.permissions.filter(isPermission),
        },
        company: { id: company.id, code: company.code, name: company.name },
      },
      memberActive: member.status === "active",
      companyActive: company.status === "active",
      blockedReason: company.blockedReason,
    };
  }

  async findAdminByAuthUser(authUserId: string): Promise<AdminProfile | null> {
    const [row] = await this.conn
      .select({ id: platformAdmins.id, name: platformAdmins.name, email: platformAdmins.email })
      .from(platformAdmins)
      .where(eq(platformAdmins.authUserId, authUserId))
      .limit(1);
    return row ? { kind: "admin", admin: row } : null;
  }
}
