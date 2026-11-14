import { useEffect, useState } from "react";
import { companyPlanSchema, PLAN_MODULE_LABELS, PLAN_MODULES, type CompanyPlan } from "@mesaflow/shared";
import { textoLimite } from "@/lib/plano";
import { sessao } from "@/lib/sessao";
import { Comanda } from "@/ui/componentes";

/** Ajustes: o plano do restaurante, com o que já está em uso. Só leitura: quem muda é a MesaFlow. */
export function SeuPlano() {
  const [p, setP] = useState<CompanyPlan | null>(null);

  useEffect(() => {
    sessao
      .requisicao("membro", "/company/plan")
      .then(async (r) => setP(companyPlanSchema.parse(await r.json())))
      .catch(() => setP(null));
  }, []);

  if (!p) return null;

  const uso = (atual: number, limite: number | null) => (limite === null ? `${atual} em uso` : `${atual} de ${limite}`);

  return (
    <Comanda como="section" aria-label="Seu plano">
      <h2>Seu plano{p.plan && `: ${p.plan}`}</h2>
      {!p.plan ? (
        <p className="suave">Sem plano definido: todas as partes do sistema estão liberadas, sem limite.</p>
      ) : (
        <>
          <ul className="seu-plano">
            <li>
              <span>{textoLimite("tables", p.limits.tables)}</span>
              {p.limits.tables !== null && <span className="suave">mesas de 1 a {p.limits.tables}</span>}
            </li>
            <li>
              <span>{textoLimite("members", p.limits.members)}</span>
              <span className="suave">{uso(p.usage.members, p.limits.members)}</span>
            </li>
            <li>
              <span>{textoLimite("products", p.limits.products)}</span>
              <span className="suave">{uso(p.usage.products, p.limits.products)}</span>
            </li>
            {PLAN_MODULES.map((m) => (
              <li key={m}>
                <span>{PLAN_MODULE_LABELS[m]}</span>
                <span className={p.modules[m] ? "suave" : "seu-plano-fora"}>{p.modules[m] ? "Incluído" : "Fora do plano"}</span>
              </li>
            ))}
          </ul>
          {p.addons.length > 0 && (
            <p className="suave">
              Produtos à parte: {p.addons.map((a) => (a.quantity > 1 ? `${a.name} × ${a.quantity}` : a.name)).join(", ")}. Já somados aos limites.
            </p>
          )}
          <p className="suave">Para mudar de plano ou contratar mais mesas, pessoas ou produtos, fale com a MesaFlow.</p>
        </>
      )}
    </Comanda>
  );
}
