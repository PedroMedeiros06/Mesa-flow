import { z } from "zod";
import { cpfSchema, passwordSchema } from "./auth.js";
import { MEMBER_ROLES, PERMISSION_KEYS, type Permission } from "./permissions.js";

const permissaoSchema = z.enum(PERMISSION_KEYS as [Permission, ...Permission[]], "Permissão desconhecida");
// Sem repetição e sempre na ordem da lista oficial, para o banco guardar sempre igual.
const permissoesSchema = z
  .array(permissaoSchema)
  .max(PERMISSION_KEYS.length)
  .transform((lista) => PERMISSION_KEYS.filter((p) => lista.includes(p)));

const nomeSchema = z.string().trim().min(2, "Informe o nome").max(80, "Nome muito longo");

export const MEMBER_STATUSES = ["active", "blocked"] as const;

export const memberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  cpf: z.string(),
  email: z.string(),
  role: z.enum(MEMBER_ROLES),
  permissions: z.array(permissaoSchema),
  status: z.enum(MEMBER_STATUSES),
  createdAt: z.string(),
});
export type Member = z.infer<typeof memberSchema>;

export const memberCreateSchema = z.object({
  name: nomeSchema,
  cpf: cpfSchema,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("E-mail inválido").max(254)),
  permissions: permissoesSchema,
});
export type MemberCreateInput = z.input<typeof memberCreateSchema>;

export const memberUpdateSchema = z
  .object({
    name: nomeSchema.optional(),
    permissions: permissoesSchema.optional(),
    status: z.enum(MEMBER_STATUSES).optional(),
  })
  .refine((v) => v.name !== undefined || v.permissions !== undefined || v.status !== undefined, "Nada para alterar");
export type MemberUpdateInput = z.input<typeof memberUpdateSchema>;

/** Link de criar ou trocar a senha. O token vale uma vez só e expira. */
export const passwordLinkSchema = z.object({ token: z.string() });
export type PasswordLink = z.infer<typeof passwordLinkSchema>;

// token null: a pessoa entrou na equipe, mas o link falhou; gere outro na tela.
export const memberCreatedSchema = z.object({ member: memberSchema, token: z.string().nullable() });
export type MemberCreated = z.infer<typeof memberCreatedSchema>;

/** Página pública /senha: troca o token do link pela senha nova. */
export const setPasswordSchema = z.object({
  token: z.string().min(10, "Link inválido").max(200, "Link inválido"),
  password: passwordSchema,
});
export type SetPasswordInput = z.input<typeof setPasswordSchema>;

export const setPasswordResultSchema = z.object({
  name: z.string(),
  companyCode: z.string(),
  companyName: z.string(),
});
export type SetPasswordResult = z.infer<typeof setPasswordResultSchema>;
