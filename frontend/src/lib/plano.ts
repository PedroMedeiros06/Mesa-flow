import { PLAN_RESOURCE_LABELS, type PlanResource } from "@mesaflow/shared";

const maiuscula = (t: string) => `${t[0]!.toUpperCase()}${t.slice(1)}`;

/** "Até 10 mesas", "Até 3 pessoas na equipe", "Mesas sem limite". */
export function textoLimite(recurso: PlanResource, limite: number | null): string {
  const { singular, plural } = PLAN_RESOURCE_LABELS[recurso];
  if (limite === null) return `${maiuscula(plural)} sem limite`;
  return `Até ${limite} ${limite === 1 ? singular : plural}`;
}

/** "+10 mesas por pacote" */
export function textoPacote(recurso: PlanResource, quanto: number): string {
  const { singular, plural } = PLAN_RESOURCE_LABELS[recurso];
  return `+${quanto} ${quanto === 1 ? singular : plural}`;
}

export { maiuscula };
