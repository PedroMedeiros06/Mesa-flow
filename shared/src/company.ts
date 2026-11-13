import { z } from "zod";
import { MAX_SERVICE_FEE_BPS } from "./tabs.js";

const soDigitos = (v: string) => v.replace(/\D/g, "");

/** Vazio ou ausente vira null: o campo é opcional (o PUT grava a tela inteira). */
const opcional = <T extends z.ZodType<string | null>>(schema: T) =>
  z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v), schema.nullable());

/** Dados do restaurante que o dono edita em Ajustes. O código de acesso não muda por aqui. */
export const companySettingsSchema = z.object({
  code: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  /** CNPJ ou CPF, só dígitos. */
  document: z.string().nullable(),
  /** Só dígitos, DDD + número, sem o 55 do país. Aparece no cardápio online para o cliente falar com o restaurante. */
  whatsapp: z.string().nullable(),
  /** Taxa de serviço com que toda mesa abre, em pontos-base (1000 = 10%). */
  serviceFeeBps: z.number().int(),
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;

export const companySettingsInputSchema = z.object({
  serviceFeeBps: z
    .number({ error: "Informe a taxa de serviço" })
    .int("Use no máximo duas casas: 10 ou 12,5")
    .min(0, "A taxa não pode ser negativa")
    .max(MAX_SERVICE_FEE_BPS, "No máximo 20%"),
  name: z.string().trim().min(2, "Informe o nome do restaurante").max(80, "Nome muito longo"),
  legalName: opcional(z.string().trim().max(120, "Use no máximo 120 caracteres")),
  document: opcional(
    z
      .string()
      .transform(soDigitos)
      .pipe(z.string().regex(/^(\d{11}|\d{14})$/, "Informe o CNPJ (14 números) ou o CPF (11 números)")),
  ),
  whatsapp: opcional(
    z
      .string()
      .transform(soDigitos)
      // Guarda sem o código do país: 55 + DDD + número vira DDD + número.
      .transform((d) => (d.length >= 12 && d.startsWith("55") ? d.slice(2) : d))
      .pipe(z.string().regex(/^\d{10,11}$/, "Informe o WhatsApp com DDD")),
  ),
});
export type CompanySettingsInput = z.input<typeof companySettingsInputSchema>;
