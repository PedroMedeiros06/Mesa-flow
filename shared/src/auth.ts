import { z } from "zod";
import { MEMBER_ROLES, PERMISSION_KEYS, type Permission } from "./permissions.js";

const somenteDigitos = (v: string) => v.replace(/\D/g, "");

// Aceita CPF com ou sem pontuação; sempre sai com 11 dígitos.
export const cpfSchema = z
  .string()
  .transform(somenteDigitos)
  .pipe(z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos"));

export const companyCodeSchema = z
  .string()
  .transform(somenteDigitos)
  .pipe(z.string().regex(/^\d{6}$/, "O código do restaurante tem 6 dígitos"));

export const passwordSchema = z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(72);

export const restaurantLoginSchema = z.object({
  companyCode: companyCodeSchema,
  cpf: cpfSchema,
  password: z.string().min(1, "Informe a senha"),
});
export type RestaurantLoginInput = z.input<typeof restaurantLoginSchema>;

export const adminLoginSchema = z.object({
  email: z.email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});
export type AdminLoginInput = z.input<typeof adminLoginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const sessionTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  // Segundos desde 1970 (igual ao "exp" do JWT).
  expiresAt: z.number().int(),
});
export type SessionTokens = z.infer<typeof sessionTokensSchema>;

export const memberProfileSchema = z.object({
  kind: z.literal("member"),
  member: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    role: z.enum(MEMBER_ROLES),
    permissions: z.array(z.enum(PERMISSION_KEYS as [Permission, ...Permission[]])),
  }),
  company: z.object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    // Taxa de serviço padrão (pontos-base). O default cobre sessões salvas antes deste campo existir.
    serviceFeeBps: z.number().int().default(1000),
  }),
});
export type MemberProfile = z.infer<typeof memberProfileSchema>;

export const adminProfileSchema = z.object({
  kind: z.literal("admin"),
  admin: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
  }),
});
export type AdminProfile = z.infer<typeof adminProfileSchema>;

export const memberSessionSchema = sessionTokensSchema.extend({ profile: memberProfileSchema });
export type MemberSession = z.infer<typeof memberSessionSchema>;

export const adminSessionSchema = sessionTokensSchema.extend({ profile: adminProfileSchema });
export type AdminSession = z.infer<typeof adminSessionSchema>;

// Formato de erro de toda a API.
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
