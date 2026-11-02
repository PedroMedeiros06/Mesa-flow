import { z } from "zod";

// Resposta de GET /api/health. O backend devolve este formato e o frontend valida com o mesmo schema.
export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.literal("mesaflow-api"),
  version: z.string(),
  time: z.iso.datetime(),
  database: z.enum(["ok", "down", "not_configured"]),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
