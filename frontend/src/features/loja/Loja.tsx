import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  formatMoney,
  orderTotals,
  parseMoney,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  storefrontOrderInputSchema,
  type PaymentMethod,
  type SellableProduct,
  type Storefront,
} from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Campo, CampoArea, CorteComanda, Dialogo, Etiqueta, Marca } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { adicionaisDa, adicionar, mudarQuantidade, paraPedido, totalLinha, type LinhaCarrinho, type NovaLinha } from "../pedidos/carrinho";
import { EscolherItem } from "../pedidos/EscolherItem";
import { Quantidade } from "../pedidos/Quantidade";
import { apiLoja } from "./api";
import { guardarCarrinho, guardarUltimoPedido, lerCarrinho, lerUltimoPedido } from "./guardado";
import "../pedidos/pedidos.css";
import "./loja.css";

/** (11) 98888-7777 enquanto a pessoa digita. */
export function mascaraTelefone(texto: string) {
  const d = texto.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function linkWhatsapp(numero: string, texto?: string) {
  const d = numero.replace(/\D/g, "");
  // DDD + número tem 10 ou 11 dígitos (o DDD 55 existe, no RS); com mais que isso já veio com o país.
  const comPais = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${comPais}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

function Preco({ p }: { p: SellableProduct }) {
  if (p.promoPriceCents === null) return <span className="num">{formatMoney(p.priceCents)}</span>;
  return (
    <span className="num">
      <s className="suave">{formatMoney(p.priceCents)}</s> <strong className="loja-promo">{formatMoney(p.promoPriceCents)}</strong>
    </span>
  );
}

/** Cardápio público do restaurante, no celular do cliente: escolhe, monta o pedido e pede para retirar. */
export function Loja() {
  const { codigo = "" } = useParams();
  const navegar = useNavigate();
  const [loja, setLoja] = useState<Storefront | null>(null);
  const [erroLoja, setErroLoja] = useState<string | null>(null);
  const [escolhendo, setEscolhendo] = useState<SellableProduct | null>(null);
  const [linhas, setLinhas] = useState<LinhaCarrinho[]>([]);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const chave = useRef(0);

  useEffect(() => {
    let vivo = true;
    apiLoja.abrir(codigo).then(
      (l) => {
        if (!vivo) return;
        setLoja(l);
        setLinhas(lerCarrinho(codigo, l.menu));
        setUltimo(lerUltimoPedido(codigo));
        document.title = `${l.company.name} | Cardápio`;
      },
      (e: unknown) => vivo && setErroLoja(e instanceof ApiErro ? e.message : "Não foi possível abrir o cardápio."),
    );
    return () => {
      vivo = false;
    };
  }, [codigo]);

  const mudar = (f: (l: LinhaCarrinho[]) => LinhaCarrinho[]) =>
    setLinhas((atual) => {
      const novas = f(atual);
      guardarCarrinho(codigo, novas);
      return novas;
    });

  function porNoCarrinho(nova: NovaLinha) {
    mudar((l) => adicionar(l, nova, `n${++chave.current}`));
    setEscolhendo(null);
  }

  if (erroLoja) {
    return (
      <main className="loja loja-erro">
        <Marca />
        <Aviso>{erroLoja}</Aviso>
      </main>
    );
  }
  if (!loja) {
    return (
      <main className="loja">
        <p className="suave">Abrindo o cardápio...</p>
      </main>
    );
  }

  const total = linhas.reduce((s, l) => s + totalLinha(l), 0);
  const qtd = linhas.reduce((s, l) => s + l.quantidade, 0);
  const cats = loja.menu.categories;

  return (
    <main className="loja">
      <header className="loja-topo">
        <h1>{loja.company.name}</h1>
        <p className="suave">Peça aqui e retire no balcão. O pagamento é na retirada.</p>
        <div className="loja-atalhos">
          {ultimo && (
            <Link className="link-btn" to={`/loja/${codigo}/pedido/${ultimo}`}>
              Acompanhar meu último pedido
            </Link>
          )}
          {loja.company.whatsapp && (
            <a className="link-btn" href={linkWhatsapp(loja.company.whatsapp)} target="_blank" rel="noreferrer">
              Falar no WhatsApp
            </a>
          )}
        </div>
      </header>

      {cats.length === 0 ? (
        <p className="suave">O cardápio ainda está vazio. Volte mais tarde.</p>
      ) : (
        <>
          {cats.length > 1 && (
            <nav className="loja-cats" aria-label="Categorias">
              {cats.map((c) => (
                <a key={c.id} href={`#cat-${c.id}`}>
                  {c.name}
                </a>
              ))}
            </nav>
          )}
          {cats.map((c) => (
            <section key={c.id} id={`cat-${c.id}`} className="loja-cat" aria-labelledby={`t-${c.id}`}>
              <h2 id={`t-${c.id}`}>{c.name}</h2>
              <ul className="loja-prods">
                {c.products.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="loja-prod"
                      disabled={p.soldOut}
                      onClick={() => setEscolhendo(p)}
                      aria-label={p.soldOut ? `${p.name}, esgotado` : undefined}
                    >
                      <span className="loja-prod-texto">
                        <strong>{p.name}</strong>
                        {p.description && <span className="suave loja-desc">{p.description}</span>}
                        {p.soldOut ? (
                          <Etiqueta tom="neutra" icone="relogio">
                            Esgotado
                          </Etiqueta>
                        ) : (
                          <Preco p={p} />
                        )}
                      </span>
                      {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <footer className="loja-rodape suave">
        Cardápio feito com <Marca className="loja-marca" />
        <Link to="/privacidade" className="loja-privacidade">
          Privacidade
        </Link>
      </footer>

      {linhas.length > 0 && (
        <button type="button" className="loja-barra" onClick={() => setCarrinhoAberto(true)}>
          <span>
            <Icone nome="sacola" tamanho={18} /> Ver pedido ({qtd} {qtd === 1 ? "item" : "itens"})
          </span>
          <strong className="num">{formatMoney(total)}</strong>
        </button>
      )}

      {escolhendo && <EscolherItem produto={escolhendo} aoFechar={() => setEscolhendo(null)} aoAdicionar={porNoCarrinho} />}
      {carrinhoAberto && (
        <Carrinho
          codigo={codigo}
          linhas={linhas}
          aoMudar={mudar}
          aoFechar={() => setCarrinhoAberto(false)}
          aoPedir={(id) => {
            guardarCarrinho(codigo, []);
            guardarUltimoPedido(codigo, id);
            navegar(`/loja/${codigo}/pedido/${id}`);
          }}
        />
      )}
    </main>
  );
}

function Carrinho({
  codigo,
  linhas,
  aoMudar,
  aoFechar,
  aoPedir,
}: {
  codigo: string;
  linhas: LinhaCarrinho[];
  aoMudar: (f: (l: LinhaCarrinho[]) => LinhaCarrinho[]) => void;
  aoFechar: () => void;
  aoPedir: (id: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [pagamento, setPagamento] = useState<PaymentMethod | null>(null);
  const [troco, setTroco] = useState("");
  const [obs, setObs] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Mesmo id nas novas tentativas do mesmo pedido: rede ruim não vira pedido em dobro.
  const [requisicao, setRequisicao] = useState(() => crypto.randomUUID());

  const { totalCents } = orderTotals(linhas.map(totalLinha));

  const mudar = (f: (l: LinhaCarrinho[]) => LinhaCarrinho[]) => {
    aoMudar(f);
    setRequisicao(crypto.randomUUID());
  };

  async function pedir(e: FormEvent) {
    e.preventDefault();
    const trocoCents = troco.trim() ? parseMoney(troco) : null;
    const dados = storefrontOrderInputSchema.safeParse({
      clientRequestId: requisicao,
      customerName: nome,
      customerPhone: telefone,
      paymentMethod: pagamento ?? undefined,
      receivedCents: pagamento === "dinheiro" ? trocoCents : null,
      notes: obs,
      items: paraPedido(linhas),
    });
    const novos: Record<string, string> = {};
    if (!dados.success) for (const i of dados.error.issues) novos[i.path.join(".")] ??= i.message;
    if (troco.trim() && trocoCents === null) novos.receivedCents = "Valor inválido";
    else if (pagamento === "dinheiro" && trocoCents !== null && trocoCents < totalCents) {
      novos.receivedCents = "Precisa ser igual ou maior que o total";
    }
    setErros(novos);
    if (!dados.success || Object.keys(novos).length) return;

    setEnviando(true);
    setErro(null);
    try {
      const pedido = await apiLoja.pedir(codigo, dados.data);
      aoPedir(pedido.id);
    } catch (falha) {
      setErro(
        falha instanceof ApiErro
          ? falha.message === "Dados inválidos"
            ? (falha.issues[0]?.message ?? falha.message)
            : falha.message
          : "Não foi possível enviar. Confira a internet e tente de novo.",
      );
      setEnviando(false);
    }
  }

  return (
    <Dialogo aberto largo aoFechar={aoFechar} titulo="Seu pedido">
      {linhas.length === 0 ? (
        <div style={{ display: "grid", gap: 16 }}>
          <p className="suave">O pedido está vazio.</p>
          <Botao variante="claro" onClick={aoFechar}>
            Voltar ao cardápio
          </Botao>
        </div>
      ) : (
        <form onSubmit={pedir} noValidate style={{ display: "grid", gap: 16 }}>
          <ul className="linhas">
            {linhas.map((l) => (
              <li key={l.chave}>
                <div className="linha-topo">
                  <strong>{l.produto.name}</strong>
                  <span className="num">{formatMoney(totalLinha(l))}</span>
                </div>
                {(l.addonIds.length > 0 || l.removidos.length > 0 || l.obs) && (
                  <ul className="linha-extras suave">
                    {adicionaisDa(l).map((a) => (
                      <li key={a.id}>+ {a.name}</li>
                    ))}
                    {l.removidos.map((id) => (
                      <li key={id}>Sem {l.produto.removable.find((r) => r.ingredientId === id)?.name.toLowerCase()}</li>
                    ))}
                    {l.obs && <li>“{l.obs}”</li>}
                  </ul>
                )}
                <div className="linha-base">
                  <Quantidade valor={l.quantidade} nome={l.produto.name} aoMudar={(q) => mudar((ls) => mudarQuantidade(ls, l.chave, q))} />
                </div>
              </li>
            ))}
          </ul>
          <CorteComanda />
          <div className="mov-campos loja-dados">
            <Campo rotulo="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.customerName} autoComplete="given-name" maxLength={60} />
            <Campo
              rotulo="Telefone com DDD"
              inputMode="tel"
              autoComplete="tel-national"
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
              erro={erros.customerPhone}
              placeholder="(11) 98888-7777"
              ajuda="Só para o restaurante falar com você sobre o pedido."
            />
          </div>
          <fieldset className="pagamento">
            <legend>Como vai pagar na retirada</legend>
            <div className="segmentos segmentos-4">
              {PAYMENT_METHODS.map((m) => (
                <button key={m} type="button" aria-pressed={pagamento === m} onClick={() => setPagamento(m)}>
                  {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>
            {erros.paymentMethod && <span className="campo-erro">{erros.paymentMethod}</span>}
          </fieldset>
          {pagamento === "dinheiro" && (
            <Campo
              rotulo="Troco para quanto? (opcional)"
              inputMode="decimal"
              placeholder="Ex.: 100,00"
              value={troco}
              onChange={(e) => setTroco(e.target.value)}
              erro={erros.receivedCents}
            />
          )}
          <CampoArea
            rotulo="Observação (opcional)"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            maxLength={300}
            placeholder="Ex.: chego às 19h"
          />
          <p className="suave loja-aviso-dados">
            Seu nome e telefone vão só para o restaurante, para falar com você sobre este pedido.{" "}
            <Link to="/privacidade">Privacidade</Link>
          </p>
          {erro && <Aviso>{erro}</Aviso>}
          <div className="loja-total">
            <span>Total</span>
            <strong className="numeral">{formatMoney(totalCents)}</strong>
          </div>
          <div className="dialogo-acoes">
            <Botao variante="claro" onClick={aoFechar}>
              Continuar escolhendo
            </Botao>
            <Botao type="submit" carregando={enviando} textoCarregando="Enviando...">
              Fazer pedido
            </Botao>
          </div>
        </form>
      )}
    </Dialogo>
  );
}
