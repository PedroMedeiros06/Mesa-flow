import { useEffect, useState } from "react";
import { billingStatusSchema, can, formatMoney, type BillingStatus } from "@mesaflow/shared";
import { sessao } from "@/lib/sessao";
import { useSessao } from "@/lib/useSessao";
import { Icone } from "@/ui/Icone";

/** Relê de tempos em tempos: o painel fica aberto o dia inteiro. */
const INTERVALO_MS = 30 * 60_000;

const nomeMes = (ref: string) =>
  new Date(`${ref.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
const data = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/**
 * Faixa no topo do painel quando há mensalidade atrasada. Só aparece para quem cuida dos dados do
 * restaurante (company.manage): garçom e cozinha não veem cobrança.
 */
export function AvisoMensalidade() {
  const membro = useSessao("membro")?.profile.member;
  const pode = !!membro && can(membro.role, membro.permissions, "company.manage");
  const [status, setStatus] = useState<BillingStatus | null>(null);

  useEffect(() => {
    if (!pode) return;
    const ler = () =>
      sessao
        .requisicao("membro", "/billing/status")
        .then(async (r) => setStatus(billingStatusSchema.parse(await r.json())))
        .catch(() => undefined); // sem conexão ou sem permissão: sem aviso, tenta de novo depois
    void ler();
    const id = window.setInterval(() => void ler(), INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [pode]);

  if (!pode || !status || status.overdue.length === 0) return null;
  const total = status.overdue.reduce((s, f) => s + f.amountCents, 0);
  const primeira = status.overdue[0]!;

  return (
    <section className="aviso-mensalidade" role="status" aria-label="Mensalidade em atraso">
      <Icone nome="cobranca" tamanho={20} />
      <p>
        {status.overdue.length === 1 ? (
          <>
            <strong>
              A mensalidade de {nomeMes(primeira.reference)} ({formatMoney(primeira.amountCents)}) venceu em {data(primeira.dueDate)}
            </strong>
            , há {primeira.daysLate} {primeira.daysLate === 1 ? "dia" : "dias"}.
          </>
        ) : (
          <>
            <strong>
              {status.overdue.length} mensalidades em atraso, somando {formatMoney(total)}
            </strong>
            . A mais antiga venceu em {data(primeira.dueDate)}.
          </>
        )}{" "}
        Se já pagou, desconsidere este aviso. Se não, regularize com a equipe MesaFlow para o acesso não ser bloqueado.
      </p>
    </section>
  );
}
