import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  can,
  isPermission,
  type Member,
  type MemberCreated,
  type MemberProfile,
  type PasswordLink,
  type Permission,
  memberCreateSchema,
  memberUpdateSchema,
} from "@mesaflow/shared";
import type { z } from "zod";
import { AuthAdmin } from "../../auth/supabase-admin.client.js";
import { DB, type Database } from "../../db/database.module.js";
import { members } from "../../db/schema.js";
import { PlanLimitsService } from "../plan-limits/plan-limits.service.js";

type CreateData = z.output<typeof memberCreateSchema>;
type UpdateData = z.output<typeof memberUpdateSchema>;

function pgCode(erro: unknown): string | undefined {
  const e = erro as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}

const naoEncontrado = () => new NotFoundException({ statusCode: 404, message: "Pessoa não encontrada." });
const cpfRepetido = () =>
  new ConflictException({ statusCode: 409, message: "Já existe alguém da equipe com este CPF." });

type Linha = typeof members.$inferSelect;
const paraApi = (m: Linha): Member => ({
  id: m.id,
  name: m.name,
  cpf: m.cpf,
  email: m.email,
  role: m.role,
  permissions: m.permissions.filter(isPermission),
  status: m.status,
  createdAt: m.createdAt.toISOString(),
});

/**
 * Equipe do restaurante. Toda consulta filtra por company_id da sessão.
 * Ninguém mexe no dono por aqui, ninguém mexe no próprio acesso, e só se dá ou tira
 * uma permissão que a própria pessoa tem (o dono tem todas).
 */
@Injectable()
export class MembersService {
  constructor(
    @Inject(DB) private readonly db: Database | null,
    private readonly authAdmin: AuthAdmin,
    private readonly limites: PlanLimitsService,
  ) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  async list(companyId: string): Promise<Member[]> {
    const linhas = await this.conn
      .select()
      .from(members)
      .where(eq(members.companyId, companyId))
      .orderBy(sql`${members.role} = 'owner' desc`, asc(members.name));
    return linhas.map(paraApi);
  }

  async create(ator: MemberProfile, dados: CreateData): Promise<MemberCreated> {
    const companyId = ator.company.id;
    this.podeMexerNas(ator, dados.permissions);

    // Confere o CPF antes de criar o login, para não sobrar usuário no Auth sem ninguém na equipe.
    const [repetido] = await this.conn
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.companyId, companyId), eq(members.cpf, dados.cpf)));
    if (repetido) throw cpfRepetido();
    // Antes de criar o login: se não cabe no plano, não sobra usuário no Auth.
    await this.limites.exigirVaga(companyId, "members");

    const authUserId = await this.authAdmin.createUser(dados.email, dados.name);
    let linha: Linha;
    try {
      [linha] = (await this.conn.transaction(async (tx) => {
        // De novo, travando o restaurante: dois cadastros ao mesmo tempo não passam juntos do limite.
        await this.limites.exigirVaga(companyId, "members", tx);
        return tx
          .insert(members)
          .values({
            companyId,
            authUserId,
            name: dados.name,
            cpf: dados.cpf,
            email: dados.email,
            role: "employee",
            permissions: dados.permissions,
          })
          .returning();
      })) as [Linha];
    } catch (erro) {
      await this.authAdmin.deleteUser(authUserId);
      if (pgCode(erro) === "23505") throw cpfRepetido();
      throw erro;
    }

    // A pessoa já está na equipe. Se o link falhar agora, dá para gerar outro na tela.
    const token = await this.authAdmin.passwordToken(dados.email).catch(() => null);
    return { member: paraApi(linha), token };
  }

  async update(ator: MemberProfile, id: string, dados: UpdateData): Promise<Member> {
    const alvo = await this.alvo(ator, id);
    if (dados.permissions) {
      const atuais = new Set<string>(alvo.permissions);
      const novas = new Set<string>(dados.permissions);
      const mudou = [...new Set([...atuais, ...novas])].filter((p) => atuais.has(p) !== novas.has(p));
      this.podeMexerNas(ator, mudou.filter(isPermission));
    }
    const [linha] = await this.conn
      .update(members)
      .set({
        ...(dados.name !== undefined && { name: dados.name }),
        ...(dados.permissions !== undefined && { permissions: dados.permissions }),
        ...(dados.status !== undefined && { status: dados.status }),
      })
      .where(and(eq(members.id, alvo.id), eq(members.companyId, ator.company.id)))
      .returning();
    return paraApi(linha!);
  }

  /** Link de criar ou trocar a senha. Serve para o convite e para quem esqueceu a senha. */
  async passwordLink(ator: MemberProfile, id: string): Promise<PasswordLink> {
    const alvo = await this.alvo(ator, id, { permitirASiMesmo: true });
    if (alvo.status === "blocked") {
      throw new ConflictException({ statusCode: 409, message: "Desbloqueie a pessoa antes de gerar o link." });
    }
    return { token: await this.authAdmin.passwordToken(alvo.email) };
  }

  /** Busca alguém da equipe para alterar, aplicando as regras de quem pode mexer em quem. */
  private async alvo(ator: MemberProfile, id: string, opcoes: { permitirASiMesmo?: boolean } = {}): Promise<Linha> {
    const [alvo] = await this.conn
      .select()
      .from(members)
      .where(and(eq(members.id, id), eq(members.companyId, ator.company.id)));
    if (!alvo) throw naoEncontrado();
    const eu = alvo.id === ator.member.id;
    if (eu && !opcoes.permitirASiMesmo) {
      throw new ForbiddenException({ statusCode: 403, message: "Você não pode alterar o seu próprio acesso." });
    }
    if (alvo.role === "owner" && !eu) {
      throw new ForbiddenException({ statusCode: 403, message: "O acesso do dono não pode ser alterado aqui." });
    }
    // Quem tem menos permissões não mexe em quem tem mais: senão geraria o link de senha
    // dessa pessoa e entraria no lugar dela.
    if (!eu)
      this.podeMexerNas(ator, alvo.permissions.filter(isPermission), "Esta pessoa tem permissões que você não tem.");
    return alvo;
  }

  private podeMexerNas(
    ator: MemberProfile,
    permissoes: Permission[],
    message = "Você só pode dar ou tirar permissões que você mesmo tem.",
  ): void {
    const { role, permissions } = ator.member;
    const falta = permissoes.filter((p) => !can(role, permissions, p));
    if (falta.length) {
      throw new ForbiddenException({ statusCode: 403, message });
    }
  }
}
