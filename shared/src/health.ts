import { z } from "zod";

// Resposta de GET /api/health. O backend devolve este formato e o frontend valida com o mesmo schema.
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("mesaflow-api"),
  version: z.string(),
  time: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
