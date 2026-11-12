import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  can,
  formatMoney,
  orderTotals,
  parseMoney,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  type DiscountKind,
  type Order,
  type PaymentMethod,
  type TabSummary,
} from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { useSessao } from "@/lib/useSessao";
import { Aviso, Botao, Campo, Comanda, CorteComanda } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { apiMesas } from "../mesas/api";
import { apiPedidos } from "./api";
import { CardapioVenda } from "./CardapioVenda";
import { adicionar, paraPedido, totalLinha, type LinhaCarrinho, type NovaLinha } from "./carrinho";
import { LinhasPedido } from "./LinhasPedido";
import "./pedidos.css";

/** PDV do caixa: escolhe no cardápio à esquerda, monta a comanda à direita e manda para a cozinha. */
export function Balcao() {
  const atual = useSessao("membro");
  const podeDesconto = !!atual && can(atual.profile.member.role, atual.profile.member.permissions, "orders.discount");
  const podeMesa = !!atual && can(atual.profile.member.role, atual.profile.member.permissions, "tabs.open");

  // Destino do pedido: pago aqui no balcão ou lançado na conta de uma mesa (paga ao fechar a mesa).
  const [destino, setDestino] = useState<"balcao" | "mesa">("balcao");
  const [mesa, setMesa] = useState("");
  const [mesasAbertas, setMesasAbertas] = useState<TabSummary[]>([]);
  const [naMesa, setNaMesa] = useState<{ label: string; numero: number | null } | null>(null);

  const [linhas, setLinhas] = useState<LinhaCarrinho[]>([]);
  const [cliente, setCliente] = useState("");
  const [pagamento, setPagamento] = useState<PaymentMethod | null>(null);
  const [recebido, setRecebido] = useState("");
  const [tipoDesconto, setTipoDesconto] = useState<DiscountKind>("valor");
  const [desconto, setDesconto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [ultimo, setUltimo] = useState<Order | null>(null);
  // Um id por versão do pedido: reenviar o mesmo pedido (rede caiu, clique duplo) não duplica.
  const [requisicao, setRequisicao] = useState(() => crypto.randomUUID());
  const proximaChave = useRef(0);
  const comanda = useRef<HTMLDivElement>(null);

  const [recarregar, setRecarregar] = useState(0);

  // Atalhos com as mesas abertas agora. Sem permissão de ver mesas, fica só o campo do número.
  useEffect(() => {
    if (destino !== "mesa") return;
    apiMesas
      .listar("abertas")
      .then((l) => setMesasAbertas(l.filter((t) => t.tableNumber !== null)))
      .catch(() => setMesasAbertas([]));
  }, [destino]);

  const mudarPedido = (f: (l: LinhaCarrinho[]) => LinhaCarrinho[]) => {
    setLinhas(f);
    setRequisicao(crypto.randomUUID());
    setErro(null);
    setUltimo(null);
    setNaMesa(null);
  };

  const porNoPedido = (nova: NovaLinha) => mudarPedido((l) => adicionar(l, nova, String(++proximaChave.current)));

  const valorDesconto = desconto.trim()
    ? tipoDesconto === "valor"
      ? parseMoney(desconto)
      : /^\d{1,3}$/.test(desconto.trim())
        ? Number(desconto.trim())
        : null
    : null;
  const totais = orderTotals(
    linhas.map(totalLinha),
    valorDesconto ? { kind: tipoDesconto, value: valorDesconto } : null,
  );
  const recebidoCents = recebido.trim() ? parseMoney(recebido) : null;
  const troco = pagamento === "dinheiro" && recebidoCents !== null ? recebidoCents - totais.totalCents : null;
  const qtdItens = linhas.reduce((s, l) => s + l.quantidade, 0);

  async function lancarNaMesa() {
    const numero = /^\d{1,3}$/.test(mesa.trim()) ? Number(mesa.trim()) : 0;
    if (numero < 1) {
      setErros({ mesa: "Informe o número da mesa (1 a 999)" });
      return;
    }
    setErros({});
    setEnviando(true);
    setErro(null);
    try {
      const conta = await apiMesas.lancarNaMesa(numero, { clientRequestId: requisicao, items: paraPedido(linhas) });
      const rodada = [...conta.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      setNaMesa({ label: conta.label, numero: rodada?.number ?? null });
      setLinhas([]);
      setMesa("");
      setRequisicao(crypto.randomUUID());
    } catch (falha) {
      if (falha instanceof ApiErro) {
        setErro(falha.message === "Dados inválidos" ? (falha.issues[0]?.message ?? falha.message) : falha.message);
        if (falha.issues.some((i) => i.path.startsWith("items"))) setRecarregar((n) => n + 1);
      } else {
        setErro("Não foi possível lançar na mesa. Tente de novo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (destino === "mesa") return lancarNaMesa();
    const novos: Record<string, string> = {};
    if (!pagamento) novos.paymentMethod = "Escolha a forma de pagamento";
    if (desconto.trim() && valorDesconto === null) {
      novos.discount = tipoDesconto === "valor" ? "Valor inválido. Use, por exemplo, 5,00" : "Use um número de 1 a 100";
    } else if (tipoDesconto === "percentual" && valorDesconto !== null && (valorDesconto < 1 || valorDesconto > 100)) {
      novos.discount = "Use um número de 1 a 100";
    }
    if (recebido.trim() && recebidoCents === null) novos.receivedCents = "Valor inválido";
    else if (troco !== null && troco < 0) novos.receivedCents = "O valor recebido é menor que o total";
    setErros(novos);
    if (Object.keys(novos).length || !pagamento) return;

    setEnviando(true);
    setErro(null);
    try {
      const pedido = await apiPedidos.criar({
        clientRequestId: requisicao,
        customerName: cliente,
        paymentMethod: pagamento,
        receivedCents: pagamento === "dinheiro" ? recebidoCents : null,
        discount: valorDesconto ? { kind: tipoDesconto, value: valorDesconto } : null,
        items: paraPedido(linhas),
      });
      setUltimo(pedido);
      setLinhas([]);
      setCliente("");
      setPagamento(null);
      setRecebido("");
      setDesconto("");
      setRequisicao(crypto.randomUUID());
    } catch (falha) {
      if (falha instanceof ApiErro) {
        setErro(falha.message === "Dados inválidos" ? (falha.issues[0]?.message ?? falha.message) : falha.message);
        // Produto que saiu de venda: recarrega o cardápio para a pessoa ver o que mudou.
        if (falha.issues.some((i) => i.path.startsWith("items"))) setRecarregar((n) => n + 1);
      } else {
        setErro("Não foi possível enviar o pedido. Tente de novo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="balcao">
      <section className="balcao-cardapio" aria-label="Cardápio">
        <div className="cab">
          <h1>Balcão</h1>
        </div>
        <CardapioVenda aoEscolher={porNoPedido} recarregar={recarregar} />
      </section>

      <form className="balcao-lado" onSubmit={enviar} noValidate>
        <Comanda como="section" className="balcao-comanda" aria-label="Pedido atual">
          <div ref={comanda} id="pedido-atual" tabIndex={-1} />
          <div className="comanda-linha">
            <h2 className="balcao-titulo">Pedido</h2>
            {linhas.length > 0 && (
              <button type="button" className="link-btn" onClick={() => mudarPedido(() => [])}>
                Limpar
              </button>
            )}
          </div>

          {naMesa && (
            <div className="balcao-enviado" role="status">
              <Icone nome="check" />
              <span>
                <strong>Lançado na conta da {naMesa.label}.</strong>
                {naMesa.numero !== null && <> Pedido {naMesa.numero} na cozinha.</>}
              </span>
            </div>
          )}

          {ultimo && (
            <div className="balcao-enviado" role="status">
              <Icone nome="check" />
              <span>
                <strong>Pedido {ultimo.number} enviado para a cozinha.</strong>
                {ultimo.changeCents > 0 && <> Troco: {formatMoney(ultimo.changeCents)}.</>}
              </span>
            </div>
          )}

          <LinhasPedido linhas={linhas} aoMudar={mudarPedido} vazio="Toque nos produtos para montar o pedido." />

          <CorteComanda />

          <div className="balcao-campos">
            {podeMesa && (
              <div className="segmentos balcao-destino" role="group" aria-label="Para onde vai o pedido">
                <button type="button" aria-pressed={destino === "balcao"} onClick={() => setDestino("balcao")}>
                  Pagar no balcão
                </button>
                <button type="button" aria-pressed={destino === "mesa"} onClick={() => setDestino("mesa")}>
                  Conta da mesa
                </button>
              </div>
            )}
            {destino === "mesa" ? (
              <div className="balcao-mesa">
                <Campo
                  rotulo="Número da mesa"
                  inputMode="numeric"
                  maxLength={3}
                  value={mesa}
                  onChange={(e) => {
                    setMesa(e.target.value.replace(/\D/g, ""));
                    setErros({});
                  }}
                  erro={erros.mesa}
                  ajuda="Se a mesa estiver livre, ela é aberta agora. O cliente paga tudo ao fechar a mesa."
                />
                {mesasAbertas.length > 0 && (
                  <div className="balcao-mesas-abertas" role="group" aria-labelledby="balcao-mesas-titulo">
                    <span id="balcao-mesas-titulo" className="suave">
                      Abertas agora:
                    </span>
                    {mesasAbertas.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={mesa === String(t.tableNumber)}
                        onClick={() => {
                          setMesa(String(t.tableNumber));
                          setErros({});
                        }}
                      >
                        {t.tableNumber}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <Campo
                  rotulo="Nome do cliente (opcional)"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  maxLength={60}
                  placeholder="Para chamar quando ficar pronto"
                />
                <fieldset className="pagamento" aria-describedby={erros.paymentMethod ? "erro-pagamento" : undefined}>
                  <legend>Pagamento</legend>
                  <div className="segmentos segmentos-4">
                    {PAYMENT_METHODS.map((m) => (
                      <button key={m} type="button" aria-pressed={pagamento === m} onClick={() => setPagamento(m)}>
                        {PAYMENT_LABELS[m]}
                      </button>
                    ))}
                  </div>
                  {erros.paymentMethod && (
                    <span className="campo-erro" id="erro-pagamento">
                      {erros.paymentMethod}
                    </span>
                  )}
                </fieldset>
                {pagamento === "dinheiro" && (
                  <Campo
                    rotulo="Recebido (opcional)"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={recebido}
                    onChange={(e) => setRecebido(e.target.value)}
                    erro={erros.receivedCents}
                    ajuda={troco !== null && troco >= 0 ? `Troco: ${formatMoney(troco)}` : "Para calcular o troco"}
                  />
                )}
                {podeDesconto && (
                  <div className="desconto">
                    <Campo
                      rotulo={tipoDesconto === "valor" ? "Desconto em reais (opcional)" : "Desconto em % (opcional)"}
                      inputMode="decimal"
                      placeholder={tipoDesconto === "valor" ? "0,00" : "10"}
                      value={desconto}
                      onChange={(e) => setDesconto(e.target.value)}
                      erro={erros.discount}
                    />
                    <div className="segmentos desconto-tipo" role="group" aria-label="Tipo de desconto">
                      <button
                        type="button"
                        aria-pressed={tipoDesconto === "valor"}
                        onClick={() => setTipoDesconto("valor")}
                      >
                        R$
                      </button>
                      <button
                        type="button"
                        aria-pressed={tipoDesconto === "percentual"}
                        onClick={() => setTipoDesconto("percentual")}
                      >
                        %
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <CorteComanda />

          <dl className="totais">
            {totais.discountCents > 0 && (
              <>
                <div>
                  <dt>Subtotal</dt>
                  <dd className="num">{formatMoney(totais.subtotalCents)}</dd>
                </div>
                <div>
                  <dt>Desconto</dt>
                  <dd className="num">− {formatMoney(totais.discountCents)}</dd>
                </div>
              </>
            )}
            <div className="total">
              <dt>{destino === "mesa" ? "Vai para a conta" : "Total"}</dt>
              <dd className="numeral">{formatMoney(totais.totalCents)}</dd>
            </div>
          </dl>

          {erro && <Aviso>{erro}</Aviso>}
          <Botao
            type="submit"
            largo
            carregando={enviando}
            textoCarregando="Enviando..."
            disabled={linhas.length === 0}
            icone="cozinha"
          >
            {destino === "mesa" ? (mesa ? `Lançar na mesa ${mesa}` : "Lançar na mesa") : "Enviar para a cozinha"}
          </Botao>
        </Comanda>
      </form>

      {linhas.length > 0 && (
        <button
          type="button"
          className="balcao-barra"
          onClick={() => {
            comanda.current?.scrollIntoView({ behavior: "smooth" });
            comanda.current?.focus({ preventScroll: true });
          }}
        >
          <span>
            Ver pedido ({qtdItens} {qtdItens === 1 ? "item" : "itens"})
          </span>
          <strong className="num">{formatMoney(totais.totalCents)}</strong>
        </button>
      )}
    </div>
  );
}
