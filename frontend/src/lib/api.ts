import { healthResponseSchema, type HealthResponse } from "@mesaflow/shared";
import { API_URL } from "./http";

export async function fetchHealth(fetcher: typeof fetch = fetch): Promise<HealthResponse> {
  let res: Response;
  try {
    res = await fetcher(`${API_URL}/health`);
  } catch {
    throw new Error("Não foi possível conectar ao servidor.");
  }
  if (!res.ok) throw new Error(`Servidor respondeu ${res.status}.`);
  return healthResponseSchema.parse(await res.json());
}
