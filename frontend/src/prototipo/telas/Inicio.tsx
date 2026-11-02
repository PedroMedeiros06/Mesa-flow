import { Icone } from "../Icone";
import { reais } from "../dados";

const AREAS = [
  {
    nome: "Salão",
    texto: "O garçom abre a mesa no celular, lança cada rodada e vê quanto já foi pago. A conta divide por pessoa ou por valor.",
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

export function Inicio() {
  return (
    <>
      <div className="lp">
        <header className="lp-topo">
          <a className="marca" href="/prototipo/inicio">
            <span className="marca-selo" aria-hidden="true" />
            MesaFlow
          </a>
          <nav aria-label="Seções">
            <a href="#como-funciona">Como funciona</a>
            <a href="#planos">Planos</a>
          </nav>
          <a className="btn btn-contorno btn-sm" href="/prototipo/entrar">
            Entrar
          </a>
        </header>

        <section className="lp-heroi">
          <div>
            <h1>Do salão à cozinha, cada pedido no lugar certo.</h1>
            <p className="lead">
              Mesas, balcão, cozinha e cardápio online no mesmo sistema. Feito para o restaurante que não pode
              parar no sábado à noite.
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
              <div className="ticket">
                <div className="ticket-linha">
                  <span className="suave">Pedido 214</span>
                  <span className="suave">20:42</span>
                </div>
                <p style={{ marginTop: 10 }}>
                  <span className="numeral">Mesa 4</span>
                </p>
                <hr className="ticket-corte" />
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                  <li className="ticket-linha">
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
                <hr className="ticket-corte" />
                <div className="ticket-linha" style={{ fontWeight: 800 }}>
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
          <div className="lp-planos-grade">
            <article className="plano">
              <h3>Essencial</h3>
              <p className="preco num">
                R$ 49<span style={{ fontSize: "0.5em" }}>,90</span>
              </p>
              <ul>
                <li>Balcão, cozinha e vitrine</li>
                <li>Cardápio com fotos e adicionais</li>
                <li>Até 3 pessoas na equipe</li>
              </ul>
            </article>
            <article className="plano plano-destaque">
              <h3>Completo</h3>
              <p className="preco num">
                R$ 99<span style={{ fontSize: "0.5em" }}>,90</span>
              </p>
              <ul>
                <li>Tudo do Essencial</li>
                <li>Mesas e comandas com divisão da conta</li>
                <li>Estoque com ficha técnica</li>
                <li>Equipe sem limite</li>
              </ul>
            </article>
          </div>
          <p className="lp-nota">Valores provisórios do protótipo. Os preços finais ainda vão ser definidos.</p>
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
    </>
  );
}
