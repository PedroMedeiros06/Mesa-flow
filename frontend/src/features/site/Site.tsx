import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  PLAN_RESOURCES,
  publicPlanAddonSchema,
  publicPlanSchema,
  type PublicPlan,
  type PublicPlanAddon,
} from "@mesaflow/shared";
import { enviar, erroDaResposta } from "@/lib/http";
import { textoLimite, textoPacote } from "@/lib/plano";
import { Icone } from "@/ui/Icone";
import { Marca, classeBotao } from "@/ui/componentes";
import "./site.css";

const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const AREAS = [
  {
    nome: "Salão",
    texto:
      "O garçom abre a mesa no celular, lança cada rodada e vê quanto já foi pago. A conta divide por pessoa ou por valor.",
    onde: "no celular do garçom",
  },
  {
    nome: "Balcão",
    texto: "O caixa monta o pedido em poucos toques, com adicionais e “sem cebola”, e o pedido já cai na cozinha.",
    onde: "no computador do caixa",
  },
  {
    nome: "Cozinha",
    texto: "Os pedidos chegam em ordem, com aviso sonoro e impressão. O que está atrasado aparece em vermelho.",
    onde: "na tela da cozinha",
  },
  {
    nome: "Vitrine",
    texto: "Seu cardápio num link para mandar no WhatsApp. O cliente pede para retirar e acompanha o preparo.",
    onde: "no celular do cliente",
  },
];

export function Site() {
  return (
    <>
      <div className="lp">
        <header className="lp-topo">
          <Marca />
          <nav aria-label="Seções">
            <a href="#como-funciona">Como funciona</a>
            <a href="#planos">Planos</a>
          </nav>
          <Link className={classeBotao("contorno", { pequeno: true })} to="/entrar">
            Entrar
          </Link>
        </header>

        <section className="lp-heroi">
          <div>
            <h1>Do salão à cozinha, cada pedido no lugar certo.</h1>
            <p className="lead">
              Mesas, balcão, cozinha e cardápio online no mesmo sistema. Feito para o restaurante que não pode parar no
              sábado à noite.
            </p>
            <div className="lp-acoes">
              <a className="btn btn-primario" href="#contato">
                <Icone nome="whatsapp" />
                Conversar no WhatsApp
              </a>
              <a className="btn btn-contorno" href="#como-funciona">
                Ver como funciona
              </a>
            </div>
          </div>

          <div className="lp-impressora" aria-label="Exemplo de comanda impressa">
            <div className="lp-boca" />
            <div className="lp-papel">
              <div className="comanda">
                <div className="comanda-linha">
                  <span className="suave">Pedido 214</span>
                  <span className="suave">20:42</span>
                </div>
                <p style={{ marginTop: 10 }}>
                  <span className="numeral">Mesa 4</span>
                </p>
                <hr className="comanda-corte" />
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                  <li className="comanda-linha">
                    <span>
                      <b>2×</b> Parmegiana de frango
                    </span>
                  </li>
                  <li>
                    <b>1×</b> Fritas média
                    <span style={{ display: "block", color: "var(--brasa-texto)", fontWeight: 700, fontSize: 14 }}>
                      sem sal
                    </span>
                  </li>
                  <li>
                    <b>3×</b> Guaraná lata
                  </li>
                </ul>
                <hr className="comanda-corte" />
                <div className="comanda-linha" style={{ fontWeight: 800 }}>
                  <span>Garçom: Rafa</span>
                  <span className="num">{reais(11680)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-areas" id="como-funciona">
          <h2>Um sistema para os quatro cantos do restaurante.</h2>
          <ul className="lp-lista">
            {AREAS.map((a) => (
              <li key={a.nome}>
                <h3>{a.nome}</h3>
                <p>{a.texto}</p>
                <span className="onde">{a.onde}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-planos" id="planos">
          <h2>Preço fixo por mês, sem taxa por pedido.</h2>
          <PlanosDoSite />
        </section>
      </div>

      <section className="lp-fim" id="contato">
        <div className="lp">
          <h2>Quer ver funcionando no seu restaurante?</h2>
          <a className="btn" href="#contato">
            <Icone nome="whatsapp" />
            Conversar no WhatsApp
          </a>
        </div>
      </section>
      <footer className="lp lp-rodape">
        <Link to="/termos">Termos de uso</Link>
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/entrar">Entrar no painel</Link>
      </footer>
    </>
  );
}

/** Preço grande com os centavos menores: R$ 99,90. */
function Preco({ centavos }: { centavos: number }) {
  const [inteiro, cents] = reais(centavos).split(",");
  return (
    <p className="preco num">
      {inteiro}
      <span style={{ fontSize: "0.5em" }}>,{cents}</span>
    </p>
  );
}

/** Planos vêm do admin (aba Planos): mudar lá muda aqui. */
function PlanosDoSite() {
  const [planos, setPlanos] = useState<PublicPlan[] | null>(null);
  const [adicionais, setAdicionais] = useState<PublicPlanAddon[]>([]);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    enviar(fetch, "/plans")
      .then(async (res) => {
        if (!res.ok) throw await erroDaResposta(res);
        setPlanos(publicPlanSchema.array().parse(await res.json()));
      })
      .catch(() => setFalhou(true));
    // Os adicionais são um extra: se falharem, os planos aparecem do mesmo jeito.
    enviar(fetch, "/plans/addons")
      .then(async (res) => (res.ok ? setAdicionais(publicPlanAddonSchema.array().parse(await res.json())) : undefined))
      .catch(() => undefined);
  }, []);

  if (falhou) return <p className="lp-nota">Não deu para carregar os planos agora. Fale com a gente pelo WhatsApp.</p>;
  if (!planos) return <p className="lp-nota">Carregando os planos...</p>;
  if (planos.length === 0) return <p className="lp-nota">Fale com a gente pelo WhatsApp para saber os valores.</p>;

  return (
    <>
      <div className="lp-planos-grade">
        {planos.map((p) => (
          <article key={p.id} className={`plano ${p.highlighted ? "plano-destaque" : ""}`}>
            <h3>{p.name}</h3>
            <Preco centavos={p.priceCents} />
            {p.description && <p className="plano-descricao">{p.description}</p>}
            <ul>
              {/* Limites saem do cadastro do plano; os itens de texto vêm depois. */}
              {PLAN_RESOURCES.map((r) => (
                <li key={r} className="plano-limite">
                  {textoLimite(r, p.limits[r])}
                </li>
              ))}
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {adicionais.length > 0 && (
        <div className="lp-adicionais">
          <h3>Precisa de mais?</h3>
          <ul>
            {adicionais.map((a) => (
              <li key={a.id}>
                <strong>{textoPacote(a.resource, a.amount)}</strong> por{" "}
                <span className="num">{reais(a.priceCents)}</span>/mês
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
