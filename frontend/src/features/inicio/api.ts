import { dashboardSummarySchema, type DashboardSummary } from "@mesaflow/shared";
import { sessao } from "@/lib/sessao";

export async function resumoDoDia(): Promise<DashboardSummary> {
  const res = await sessao.requisicao("membro", "/dashboard/summary");
  return dashboardSummarySchema.parse(await res.json());
}
