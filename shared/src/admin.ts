import { z } from "zod";
import { cpfSchema } from "./auth.js";

export const COMPANY_STATUSES = ["active", "blocked"] as const;

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

const texto = (min: number, max: number, vazio: string) =>
  z.string().trim().min(min, vazio).max(max, `Use no máximo ${max} caracteres`);

/** Endereço do restaurante. Complemento é o único opcional; sem número, use "S/N". */
export const addressSchema = z.object({
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{8}$/, "O CEP tem 8 números")),
  street: texto(2, 120, "Informe a rua"),
  number: texto(1, 20, "Informe o número (ou S/N)"),
  complement: z.string().trim().max(80, "Use no máximo 80 caracteres").default(""),
  district: texto(2, 80, "Informe o bairro"),
  city: texto(2, 80, "Informe a cidade"),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(UFS, { error: "Escolha o estado" })),
});
export type Address = z.output<typeof addressSchema>;
export type AddressInput = z.input<typeof addressSchema>;

/** Linha da lista de restaurantes no admin. */
export const adminCompanySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  status: z.enum(COMPANY_STATUSES),
  blockedReason: z.string().nullable(),
  createdAt: z.string(),
  owner: z.object({ id: z.uuid(), name: z.string(), email: z.string() }).nullable(),
  /** null nos restaurantes cadastrados antes do endereço existir. */
  address: z
    .object({
      cep: z.string(),
      street: z.string(),
      number: z.string(),
      complement: z.string(),
      district: z.string(),
      city: z.string(),
      state: z.string(),
    })
    .nullable(),
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
  address: addressSchema,
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

/** Visão geral do admin: restaurantes, faturamento esperado e onde estão no mapa. */
export const adminOverviewSchema = z.object({
  activeCount: z.number().int(),
  blockedCount: z.number().int(),
  /** Soma dos planos dos restaurantes ativos: o bruto esperado por mês. */
  expectedMonthlyCents: z.number().int(),
  /** Restaurantes ativos sem plano definido (não entram no esperado). */
  activeWithoutPlan: z.number().int(),
  /** Só restaurantes ativos com endereço. */
  byState: z.array(z.object({ state: z.string(), companies: z.number().int() })),
  byCity: z.array(z.object({ state: z.string(), city: z.string(), companies: z.number().int() })),
  activeWithoutAddress: z.number().int(),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;
