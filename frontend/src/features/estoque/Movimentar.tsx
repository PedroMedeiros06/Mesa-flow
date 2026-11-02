import { useEffect, useState, type FormEvent } from "react";
import { formatQuantity, parseQuantity, type Ingredient, type Movement, type MovementKind } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Campo, Dialogo } from "@/ui/componentes";
import { apiEstoque } from "./api";

type Manual = "entrada" | "perda" | "contagem";

const OPCOES: { tipo: Manual; nome: string; rotulo: string; ajuda: string }[] = [
  { tipo: "entrada", nome: "Entrada", rotulo: "Quanto chegou", ajuda: "Compra ou reposição. Soma ao estoque." },
  { tipo: "perda", nome: "Perda", rotulo: "Quanto perdeu", ajuda: "Estragou, quebrou ou venceu. Tira do estoque." },
  { tipo: "contagem", nome: "Contagem", rotulo: "Quanto tem agora", ajuda: "Você contou na prateleira. O saldo passa a ser este." },
];

export const NOMES_MOVIMENTO: Record<MovementKind, string> = {
  entrada: "Entrada",
  perda: "Perda",
  contagem: "Contagem",
  venda: "Venda",
  estorno: "Estorno",
};

/** Registrar entrada, perda ou contagem, com o histórico do ingrediente embaixo. */
export function Movimentar({
  ingrediente,
  aoFechar,
  aoSalvar,
}: {
  ingrediente: Ingredient;
  aoFechar: () => void;
  aoSalvar: (atualizado: Ingredient, mensagem: string) => void;
}) {
  const [tipo, setTipo] = useState<Manual>("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erroCampo, setErroCampo] = useState<string>();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [historico, setHistorico] = useState<Movement[] | null>(null);
  const [atual, setAtual] = useState(ingrediente);

  useEffect(() => {
    apiEstoque
      .historico(ingrediente.id)
      .then(setHistorico)
      .catch(() => setHistorico([]));
  }, [ingrediente.id]);

  const opcao = OPCOES.find((o) => o.tipo === tipo)!;

  async function registrar(e: FormEvent) {
    e.preventDefault();
    const q = parseQuantity(quantidade);
    if (q === null || (tipo !== "contagem" && q === 0)) {
      setErroCampo(quantidade.trim() ? "Quantidade inválida. Use, por exemplo, 2,5" : "Informe a quantidade");
      return;
    }
    setErroCampo(undefined);
    setErro(null);
    setEnviando(true);
    try {
      const novo = await apiEstoque.movimentar(ingrediente.id, { kind: tipo, quantityMilli: q, reason: motivo });
      setAtual(novo);
      setQuantidade("");
      setMotivo("");
      setHistorico(await apiEstoque.historico(ingrediente.id));
      aoSalvar(novo, `${opcao.nome} registrada. Saldo: ${formatQuantity(novo.stockMilli, novo.unit)}.`);
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível registrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo aberto largo aoFechar={aoFechar} titulo={atual.name}>
      <p className="mov-saldo">
        Saldo atual <strong className="num">{formatQuantity(atual.stockMilli, atual.unit)}</strong>
      </p>
      <form onSubmit={registrar} noValidate style={{ display: "grid", gap: 14 }}>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="segmentos" role="group" aria-label="Tipo de movimento">
          {OPCOES.map((o) => (
            <button
              key={o.tipo}
              type="button"
              aria-pressed={tipo === o.tipo}
              onClick={() => setTipo(o.tipo)}
            >
              {o.nome}
            </button>
          ))}
        </div>
        <div className="mov-campos">
          <Campo
            rotulo={`${opcao.rotulo} (${atual.unit})`}
            inputMode="decimal"
            placeholder="0"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            erro={erroCampo}
            ajuda={opcao.ajuda}
          />
          <Campo rotulo="Observação (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ex.: nota 1234, fornecedor" />
        </div>
        <div className="dialogo-acoes">
          <Botao variante="claro" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao type="submit" carregando={enviando} textoCarregando="Registrando...">
            Registrar {opcao.nome.toLowerCase()}
          </Botao>
        </div>
      </form>

      <section aria-label="Histórico" className="historico">
        <h3>Histórico</h3>
        {historico === null && <p className="suave">Carregando...</p>}
        {historico?.length === 0 && <p className="suave">Nada registrado ainda.</p>}
        {historico && historico.length > 0 && (
          <ol>
            {historico.map((m) => (
              <li key={m.id}>
                <span>
                  <strong>{NOMES_MOVIMENTO[m.kind]}</strong>
                  <span className="suave">
                    {new Date(m.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    {m.memberName ? `, ${m.memberName}` : ""}
                    {m.reason ? `. ${m.reason}` : ""}
                  </span>
                </span>
                <span className={`num mov-delta ${m.deltaMilli < 0 ? "mov-saida" : ""}`}>
                  {m.deltaMilli > 0 ? "+" : ""}
                  {formatQuantity(m.deltaMilli, atual.unit)}
                </span>
                <span className="num suave">{formatQuantity(m.balanceAfterMilli, atual.unit)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Dialogo>
  );
}
