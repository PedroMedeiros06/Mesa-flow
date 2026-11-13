import { useEffect, useState } from "react";
import { Link } from "react-router";
import { adminOverviewSchema, formatMoney, type AdminOverview } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { sessao } from "@/lib/sessao";
import { Aviso, Comanda } from "@/ui/componentes";
import { MapaBrasil } from "./MapaBrasil";
import "./admin.css";
import "./mapa.css";

/** /admin: restaurantes ativos, bruto esperado no mês pelos planos e o mapa de onde eles estão. */
export function VisaoGeral() {
  const [r, setR] = useState<AdminOverview | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    sessao
      .requisicao("admin", "/admin/companies/overview")
      .then(async (res) => setR(adminOverviewSchema.parse(await res.json())))
      .catch((falha: unknown) => setErro(falha instanceof ApiErro ? falha.message : "Não foi possível carregar a visão geral."));
  }, []);

  return (
    <>
      <div className="cab">
        <h1>Visão geral</h1>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!r && !erro && <p className="suave">Carregando...</p>}
      {r && (
        <>
          <div className="visao-numeros">
            <Comanda>
              <span className="suave">Restaurantes ativos</span>
              <strong className="numeral">{r.activeCount}</strong>
              <span className="suave">
                {r.blockedCount > 0 ? `${r.blockedCount} bloqueado${r.blockedCount === 1 ? "" : "s"}` : "Nenhum bloqueado"}
              </span>
            </Comanda>
            <Comanda>
              <span className="suave">Bruto esperado no mês</span>
              <strong className="numeral">{formatMoney(r.expectedMonthlyCents)}</strong>
              <span className="suave">
                Soma dos planos dos restaurantes ativos.
                {r.activeWithoutPlan > 0 && (
                  <>
                    {" "}
                    <Link to="/admin/cobranca" className="visao-link">
                      {r.activeWithoutPlan} sem plano
                    </Link>{" "}
                    {r.activeWithoutPlan === 1 ? "fica" : "ficam"} de fora.
                  </>
                )}
              </span>
            </Comanda>
          </div>

          <Comanda como="section" aria-label="Onde estão os restaurantes" className="visao-mapa">
            <h2>Onde estão os restaurantes</h2>
            <MapaBrasil porEstado={r.byState} porCidade={r.byCity} semEndereco={r.activeWithoutAddress} />
          </Comanda>
        </>
      )}
    </>
  );
}
