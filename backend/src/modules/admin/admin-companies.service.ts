import { randomInt } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  Address,
  AdminCompany,
  AdminCompanyCreated,
  adminCompanyCreateSchema,
  adminCompanyStatusSchema,
  PasswordLink,
} from "@mesaflow/shared";
import type { z } from "zod";
import { AuthAdmin } from "../../auth/supabase-admin.client.js";
import { DB, type Database } from "../../db/database.module.js";
import { companies, members, orders } from "../../db/schema.js";

type CreateData = z.output<typeof adminCompanyCreateSchema>;
type StatusData = z.output<typeof adminCompanyStatusSchema>;

function restricao(erro: unknown): string | undefined {
  const e = erro as { constraint_name?: string; constraint?: string; cause?: { constraint_name?: string; constraint?: string } };
  return e.constraint_name ?? e.constraint ?? e.cause?.constraint_name ?? e.cause?.constraint;
}

/** Endereço da API para as colunas de companies. */
const colunasEndereco = (e: Address) => ({
  addressCep: e.cep,
  addressStreet: e.street,
  addressNumber: e.number,
  addressComplement: e.complement,
  addressDistrict: e.district,
  addressCity: e.city,
  addressState: e.state,
});

const naoEncontrado = () => new NotFoundException({ statusCode: 404, message: "Restaurante não encontrado." });

/**
 * Restaurantes vistos pela equipe MesaFlow: cadastro assistido (restaurante + dono + link de senha),
 * bloqueio com motivo e link de senha para o dono. Substitui o script seed:restaurante.
 */
@Injectable()
export class AdminCompaniesService {
  constructor(
    @Inject(DB) private readonly db: Database | null,
    private readonly authAdmin: AuthAdmin,
  ) {}

  private get conn(): Database {
    if (!this.db) throw new ServiceUnavailableException({ statusCode: 503, message: "Banco não configurado." });
    return this.db;
  }

  async list(): Promise<AdminCompany[]> {
    return this.consultar();
  }

  private async consultar(id?: string): Promise<AdminCompany[]> {
    const dono = this.conn
      .select({ companyId: members.companyId, id: members.id, name: members.name, email: members.email })
      .from(members)
      .where(eq(members.role, "owner"))
      .as("dono");
    const linhas = await this.conn
      .select({
        id: companies.id,
        code: companies.code,
        name: companies.name,
        status: companies.status,
        blockedReason: companies.blockedReason,
        createdAt: companies.createdAt,
        ownerId: dono.id,
        ownerName: dono.name,
        ownerEmail: dono.email,
        cep: companies.addressCep,
        street: companies.addressStreet,
        number: companies.addressNumber,
        complement: companies.addressComplement,
        district: companies.addressDistrict,
        city: companies.addressCity,
        state: companies.addressState,
        membersCount: sql<number>`(select count(*)::int from ${members} m where m.company_id = ${companies.id})`,
        ordersLast30Days: sql<number>`(select count(*)::int from ${orders} o where o.company_id = ${companies.id} and o.created_at > now() - interval '30 days')`,
        lastOrderAt: sql<string | null>`(select max(o.created_at) from ${orders} o where o.company_id = ${companies.id})`,
      })
      .from(companies)
      .leftJoin(dono, eq(dono.companyId, companies.id))
      .where(id ? eq(companies.id, id) : undefined)
      .orderBy(asc(companies.status), desc(companies.createdAt));

    // Mais de um dono no mesmo restaurante: fica o primeiro (a lista mostra um contato só).
    const vistos = new Set<string>();
    return linhas
      .filter((l) => (vistos.has(l.id) ? false : (vistos.add(l.id), true)))
      .map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        status: l.status,
        blockedReason: l.blockedReason,
        createdAt: l.createdAt.toISOString(),
        owner: l.ownerId ? { id: l.ownerId, name: l.ownerName!, email: l.ownerEmail! } : null,
        address: l.cep
          ? {
              cep: l.cep,
              street: l.street ?? "",
              number: l.number ?? "",
              complement: l.complement ?? "",
              district: l.district ?? "",
              city: l.city ?? "",
              state: l.state ?? "",
            }
          : null,
        membersCount: l.membersCount,
        ordersLast30Days: l.ordersLast30Days,
        lastOrderAt: l.lastOrderAt ? new Date(l.lastOrderAt).toISOString() : null,
      }));
  }

  private async um(id: string): Promise<AdminCompany> {
    const [c] = await this.consultar(id);
    if (!c) throw naoEncontrado();
    return c;
  }

  async create(dados: CreateData): Promise<AdminCompanyCreated> {
    const authUserId = await this.authAdmin.createUser(dados.ownerEmail, dados.ownerName);
    let companyId: string | undefined;
    try {
      // O código de 6 números é sorteado; se já existir, sorteia de novo.
      for (let tentativa = 0; !companyId && tentativa < 10; tentativa++) {
        try {
          companyId = await this.conn.transaction(async (tx) => {
            const [c] = await tx
              .insert(companies)
              .values({ code: String(randomInt(100000, 1000000)), name: dados.name, ...colunasEndereco(dados.address) })
              .returning({ id: companies.id });
            await tx.insert(members).values({
              companyId: c!.id,
              authUserId,
              name: dados.ownerName,
              cpf: dados.ownerCpf,
              email: dados.ownerEmail,
              role: "owner",
            });
            return c!.id;
          });
        } catch (erro) {
          if (restricao(erro) !== "companies_code_unique") throw erro;
        }
      }
      if (!companyId) throw new Error("Não foi possível sortear um código livre para o restaurante.");
    } catch (erro) {
      // Sem restaurante, não pode sobrar login do dono no Auth.
      await this.authAdmin.deleteUser(authUserId);
      throw erro;
    }

    const token = await this.authAdmin.passwordToken(dados.ownerEmail).catch(() => null);
    return { company: await this.um(companyId), token };
  }

  async setStatus(id: string, dados: StatusData): Promise<AdminCompany> {
    const [c] = await this.conn
      .update(companies)
      .set(dados.status === "blocked" ? { status: "blocked", blockedReason: dados.reason } : { status: "active", blockedReason: null })
      .where(eq(companies.id, id))
      .returning({ id: companies.id });
    if (!c) throw naoEncontrado();
    return this.um(id);
  }

  /** Corrige ou completa o endereço (os restaurantes antigos não têm). */
  async setAddress(id: string, endereco: Address): Promise<AdminCompany> {
    const [c] = await this.conn
      .update(companies)
      .set(colunasEndereco(endereco))
      .where(eq(companies.id, id))
      .returning({ id: companies.id });
    if (!c) throw naoEncontrado();
    return this.um(id);
  }

  /** Link de senha do dono: primeiro acesso ou senha esquecida. */
  async ownerLink(id: string): Promise<PasswordLink> {
    const c = await this.um(id);
    if (!c.owner) throw new ConflictException({ statusCode: 409, message: "Este restaurante não tem dono cadastrado." });
    const [dono] = await this.conn
      .select({ status: members.status })
      .from(members)
      .where(and(eq(members.id, c.owner.id), eq(members.companyId, id)));
    if (dono?.status === "blocked") {
      throw new ConflictException({ statusCode: 409, message: "O acesso do dono está bloqueado." });
    }
    return { token: await this.authAdmin.passwordToken(c.owner.email) };
  }
}
