import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { formatMoney, PAYMENT_LABELS, type OrderStatus, type PublicOrder } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Comanda, CorteComanda, Marca } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { hora } from "../pedidos/ticket";
import { apiLoja } from "./api";
import { linkWhatsapp } from "./Loja";
import "./loja.css";

const INTERVALO_MS = 15_000;

/** Os passos na língua do cliente (a cozinha fala "novo"; o cliente lê "recebido"). */
const PASSOS: { status: Exclude<OrderStatus, "cancelado">; nome: string; detalhe: string }[] = [
  { status: "novo", nome: "Recebido", detalhe: "O restaurante já viu o seu pedido." },
  { status: "preparo", nome: "Em preparo", detalhe: "A cozinha está preparando." },
  { status: "pronto", nome: "Pronto para retirar", detalhe: "Pode buscar no balcão." },
  { status: "entregue", nome: "Retirado", detalhe: "Bom apetite!" },
];

/** Página que o cliente deixa aberta no celular: atualiza sozinha até o pedido ser retirado. */
export function AcompanharPedido() {
  const { codigo = "", id = "" } = useParams();
  const [pedido, setPedido] = useState<PublicOrder | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let timer: number | undefined;
    const ler = async () => {
      try {
        const p = await apiLoja.acompanhar(codigo, id);
        if (!vivo) return;
        setPedido(p);
        setErro(null);
        document.title = `Pedido ${p.number} | ${p.company.name}`;
        if (p.status === "entregue" || p.status === "cancelado") return;
      } catch (falha) {
        if (!vivo) return;
        setErro(falha instanceof ApiErro ? falha.message : "Sem conexão. Tentando de novo...");
        if (falha instanceof ApiErro && falha.status === 404) return;
      }
      timer = window.setTimeout(ler, INTERVALO_MS);
    };
    void ler();
    return () => {
      vivo = false;
      window.clearTimeout(timer);
    };
  }, [codigo, id]);

  if (!pedido) {
    return (
      <main className="loja">
        {erro ? <Aviso>{erro}</Aviso> : <p className="suave">Buscando o seu pedido...</p>}
        <Link className="link-btn" to={`/loja/${codigo}`}>
          Ver o cardápio
        </Link>
      </main>
    );
  }

  const atual = PASSOS.findIndex((p) => p.status === pedido.status);
  const cancelado = pedido.status === "cancelado";

  return (
    <main className="loja acompanhar">
      <p className="suave">{pedido.company.name}</p>
      <Comanda como="article" className="acompanhar-comanda" aria-label={`Pedido ${pedido.number}`}>
        <div className="acompanhar-cab">
          <span>
            Pedido
            <strong className="numeral">{pedido.number}</strong>
          </span>
          <span className="suave">
            {pedido.customerName}
            <br />
            feito às {hora(pedido.createdAt)}
          </span>
        </div>

        {cancelado ? (
          <Aviso>
            Este pedido foi cancelado pelo restaurante.
            {pedido.cancelReason && <> Motivo: {pedido.cancelReason}</>}
          </Aviso>
        ) : (
          <ol className="passos" aria-label="Andamento do pedido">
            {PASSOS.map((p, i) => (
              <li
                key={p.status}
                className={i < atual ? "passo-feito" : i === atual ? "passo-atual" : undefined}
                aria-current={i === atual ? "step" : undefined}
              >
                <span className="passo-marca" aria-hidden="true">
                  {i < atual ? <Icone nome="check" tamanho={14} /> : null}
                </span>
                <span>
                  <strong>{p.nome}</strong>
                  {i === atual && <span className="suave"> {p.detalhe}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}

        <CorteComanda />
        <ul className="detalhe-itens">
          {pedido.items.map((i) => (
            <li key={i.id}>
              <span>
                {i.quantity}× {i.name}
                {(i.addons.length > 0 || i.removed.length > 0 || i.notes) && (
                  <span className="suave">
                    {[...i.addons.map((a) => `+ ${a.name}`), ...i.removed.map((r) => `sem ${r.toLowerCase()}`), i.notes]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
              </span>
              <span className="num">{formatMoney(i.totalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="loja-total">
          <span>
            Total{pedido.paymentMethod && <span className="suave"> ({PAYMENT_LABELS[pedido.paymentMethod]} na retirada)</span>}
          </span>
          <strong className="numeral">{formatMoney(pedido.totalCents)}</strong>
        </div>
      </Comanda>

      {!cancelado && pedido.status !== "entregue" && (
        <p className="suave" role="status">
          Esta página se atualiza sozinha. Pode deixar aberta.
        </p>
      )}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="loja-atalhos">
        <Link className="link-btn" to={`/loja/${codigo}`}>
          Voltar ao cardápio
        </Link>
        {pedido.company.whatsapp && (
          <a
            className="link-btn"
            href={linkWhatsapp(pedido.company.whatsapp, `Olá! Sobre o meu pedido ${pedido.number}.`)}
            target="_blank"
            rel="noreferrer"
          >
            Falar com o restaurante
          </a>
        )}
      </div>
      <footer className="loja-rodape suave">
        Cardápio feito com <Marca className="loja-marca" />
      </footer>
    </main>
  );
}
