import { z } from "zod";
import { cpfSchema } from "./auth.js";

export const COMPANY_STATUSES = ["active", "blocked"] as const;

/** Linha da lista de restaurantes no admin. */
export const adminCompanySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  status: z.enum(COMPANY_STATUSES),
  blockedReason: z.string().nullable(),
  createdAt: z.string(),
  owner: z.object({ id: z.uuid(), name: z.string(), email: z.string() }).nullable(),
  membersCount: z.number().int(),
  /** Pedidos (balcão, vitrine e rodadas de mesa) nos últimos 30 dias: mostra quem está usando. */
  ordersLast30Days: z.number().int(),
  lastOrderAt: z.string().nullable(),
});
export type AdminCompany = z.infer<typeof adminCompanySchema>;

/** Cadastro assistido: o admin cria o restaurante e o dono recebe o link para criar a senha. */
export const adminCompanyCreateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do restaurante").max(80, "Nome muito longo"),
  ownerName: z.string().trim().min(2, "Informe o nome do dono").max(80, "Nome muito longo"),
  ownerCpf: cpfSchema,
  ownerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("E-mail inválido").max(254)),
});
export type AdminCompanyCreateInput = z.input<typeof adminCompanyCreateSchema>;

/** token null: o restaurante foi criado, mas o link falhou; gere outro na lista. */
export const adminCompanyCreatedSchema = z.object({ company: adminCompanySchema, token: z.string().nullable() });
export type AdminCompanyCreated = z.infer<typeof adminCompanyCreatedSchema>;

export const adminCompanyStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("active") }),
  z.object({
    status: z.literal("blocked"),
    reason: z.string().trim().min(3, "Diga o motivo do bloqueio").max(200, "Use no máximo 200 caracteres"),
  }),
]);
export type AdminCompanyStatusInput = z.input<typeof adminCompanyStatusSchema>;
