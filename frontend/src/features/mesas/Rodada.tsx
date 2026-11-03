import { useRef, useState } from "react";
import { formatMoney, type TabDetail } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Campo, Comanda, CorteComanda } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { CardapioVenda } from "../pedidos/CardapioVenda";
import { adicionar, paraPedido, totalLinha, type LinhaCarrinho, type NovaLinha } from "../pedidos/carrinho";
import { LinhasPedido } from "../pedidos/LinhasPedido";
import { apiMesas } from "./api";

/** Lançar uma rodada na mesa: mesmo cardápio do balcão, sem pagamento (a conta fecha no fim). */
export function Rodada({
  comanda,
  aoVoltar,
  aoLancar,
}: {
  comanda: TabDetail;
  aoVoltar: () => void;
  aoLancar: (c: TabDetail) => void;
}) {
  const [linhas, setLinhas] = useState<LinhaCarrinho[]>([]);
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recarregar, setRecarregar] = useState(0);
  // Um id por versão da rodada: reenviar a mesma (rede caiu, clique duplo) não lança duas vezes.
  const [requisicao, setRequisicao] = useState(() => crypto.randomUUID());
  const proximaChave = useRef(0);
  const lado = useRef<HTMLDivElement>(null);

  const mudar = (f: (l: LinhaCarrinho[]) => LinhaCarrinho[]) => {
    setLinhas(f);
    setRequisicao(crypto.randomUUID());
    setErro(null);
  };
  const porNaRodada = (nova: NovaLinha) => mudar((l) => adicionar(l, nova, String(++proximaChave.current)));

  const total = linhas.reduce((s, l) => s + totalLinha(l), 0);
  const qtd = linhas.reduce((s, l) => s + l.quantidade, 0);

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      aoLancar(await apiMesas.lancar(comanda.id, { clientRequestId: requisicao, notes: obs, items: paraPedido(linhas) }));
    } catch (falha) {
      if (falha instanceof ApiErro) {
        setErro(falha.message === "Dados inválidos" ? (falha.issues[0]?.message ?? falha.message) : falha.message);
        if (falha.issues.some((i) => i.path.startsWith("items"))) setRecarregar((n) => n + 1);
      } else {
        setErro("Não foi possível lançar a rodada. Tente de novo.");
      }
      setEnviando(false);
    }
  }

  return (
    <div className="balcao">
      <section className="balcao-cardapio" aria-label="Cardápio">
        <div className="cab">
          <div>
            <button type="button" className="link-btn mesa-voltar" onClick={aoVoltar}>
              <Icone nome="voltar" tamanho={18} /> {comanda.label}
            </button>
            <h1>Nova rodada</h1>
          </div>
        </div>
        <CardapioVenda aoEscolher={porNaRodada} recarregar={recarregar} />
      </section>

      <div className="balcao-lado">
        <Comanda como="section" className="balcao-comanda" aria-label="Rodada">
          <div ref={lado} tabIndex={-1} />
          <div className="comanda-linha">
            <h2 className="balcao-titulo">{comanda.label}</h2>
            {linhas.length > 0 && (
              <button type="button" className="link-btn" onClick={() => mudar(() => [])}>
                Limpar
              </button>
            )}
          </div>
          <LinhasPedido linhas={linhas} aoMudar={mudar} vazio="Toque nos produtos para montar a rodada." />
          <CorteComanda />
          <Campo
            rotulo="Observação para a cozinha (opcional)"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            maxLength={300}
            placeholder="Ex.: servir junto, sem pressa"
          />
          <dl className="totais">
            <div className="total">
              <dt>Rodada</dt>
              <dd className="numeral">{formatMoney(total)}</dd>
            </div>
          </dl>
          {erro && <Aviso>{erro}</Aviso>}
          <Botao largo icone="cozinha" carregando={enviando} textoCarregando="Lançando..." disabled={linhas.length === 0} onClick={enviar}>
            Lançar e mandar para a cozinha
          </Botao>
          <Botao largo variante="claro" onClick={aoVoltar}>
            Voltar para a conta
          </Botao>
        </Comanda>
      </div>

      {linhas.length > 0 && (
        <button
          type="button"
          className="balcao-barra"
          onClick={() => {
            lado.current?.scrollIntoView({ behavior: "smooth" });
            lado.current?.focus({ preventScroll: true });
          }}
        >
          <span>
            Ver rodada ({qtd} {qtd === 1 ? "item" : "itens"})
          </span>
          <strong className="num">{formatMoney(total)}</strong>
        </button>
      )}
    </div>
  );
}
