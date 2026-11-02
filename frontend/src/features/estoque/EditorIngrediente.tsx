import { useState, type FormEvent } from "react";
import {
  ingredientCreateSchema,
  parseQuantity,
  quantityToInput,
  UNIT_LABELS,
  UNITS,
  type Ingredient,
  type Unit,
} from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Campo, Dialogo, Seletor } from "@/ui/componentes";
import { apiEstoque } from "./api";

/** Criar (ingrediente = null) ou editar nome, unidade e alerta de mínimo. */
export function EditorIngrediente({
  ingrediente,
  aoFechar,
  aoSalvar,
}: {
  ingrediente: Ingredient | null;
  aoFechar: () => void;
  aoSalvar: (mensagem: string) => void;
}) {
  const [nome, setNome] = useState(ingrediente?.name ?? "");
  const [unidade, setUnidade] = useState<Unit>(ingrediente?.unit ?? "kg");
  const [minimo, setMinimo] = useState(ingrediente?.minStockMilli != null ? quantityToInput(ingrediente.minStockMilli) : "");
  const [inicial, setInicial] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const errosLocais: Record<string, string> = {};
    const minStockMilli = minimo.trim() ? parseQuantity(minimo) : null;
    if (minimo.trim() && minStockMilli === null) errosLocais.minStockMilli = "Quantidade inválida. Use, por exemplo, 2,5";
    const initialStockMilli = inicial.trim() ? parseQuantity(inicial) : 0;
    if (initialStockMilli === null) errosLocais.initialStockMilli = "Quantidade inválida. Use, por exemplo, 2,5";
    const dados = ingredientCreateSchema.safeParse({ name: nome, unit: unidade, minStockMilli, initialStockMilli: initialStockMilli ?? 0 });
    if (!dados.success) for (const i of dados.error.issues) errosLocais[i.path.join(".")] ??= i.message;
    setErros(errosLocais);
    if (!dados.success || Object.keys(errosLocais).length) return;

    setErro(null);
    setEnviando(true);
    try {
      if (ingrediente) {
        const { initialStockMilli: _, ...edicao } = dados.data;
        await apiEstoque.editar(ingrediente.id, edicao);
      } else {
        await apiEstoque.criar(dados.data);
      }
      aoSalvar(ingrediente ? "Ingrediente salvo." : "Ingrediente criado.");
    } catch (falha) {
      if (falha instanceof ApiErro && falha.issues.length) setErros(Object.fromEntries(falha.issues.map((i) => [i.path, i.message])));
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível salvar. Tente de novo.");
      setEnviando(false);
    }
  }

  async function apagar() {
    if (!ingrediente) return;
    setEnviando(true);
    try {
      await apiEstoque.apagar(ingrediente.id);
      aoSalvar("Ingrediente apagado.");
    } catch (falha) {
      setConfirmarApagar(false);
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível apagar.");
      setEnviando(false);
    }
  }

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={ingrediente ? "Editar ingrediente" : "Novo ingrediente"}>
      <form onSubmit={salvar} noValidate style={{ display: "grid", gap: 16 }}>
        {erro && <Aviso>{erro}</Aviso>}
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.name} placeholder="Ex.: Muçarela" autoFocus />
        <Seletor
          rotulo="Unidade"
          value={unidade}
          onChange={(e) => setUnidade(e.target.value as Unit)}
          erro={erros.unit}
          ajuda={ingrediente ? "Só muda com o estoque zerado e fora das fichas técnicas." : "Como você compra e conta este ingrediente."}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]} ({u})
            </option>
          ))}
        </Seletor>
        {!ingrediente && (
          <Campo
            rotulo={`Quanto tem agora (${unidade})`}
            inputMode="decimal"
            placeholder="0"
            value={inicial}
            onChange={(e) => setInicial(e.target.value)}
            erro={erros.initialStockMilli}
          />
        )}
        <Campo
          rotulo={`Avisar quando chegar a (${unidade})`}
          inputMode="decimal"
          placeholder="Sem aviso"
          value={minimo}
          onChange={(e) => setMinimo(e.target.value)}
          erro={erros.minStockMilli}
          ajuda="O ingrediente aparece como “acabando” nesse ponto. Deixe vazio para não avisar."
        />
        {confirmarApagar ? (
          <Aviso>
            Apagar “{ingrediente?.name}” e todo o histórico dele? Não dá para desfazer.
            <div className="dialogo-acoes" style={{ marginTop: 10, justifyContent: "flex-start" }}>
              <Botao variante="claro" pequeno onClick={() => setConfirmarApagar(false)}>
                Manter
              </Botao>
              <Botao variante="perigo" pequeno onClick={apagar} carregando={enviando} textoCarregando="Apagando...">
                Apagar ingrediente
              </Botao>
            </div>
          </Aviso>
        ) : (
          <div className="dialogo-acoes">
            {ingrediente && (
              <Botao variante="claro" onClick={() => setConfirmarApagar(true)} style={{ marginRight: "auto" }}>
                Apagar
              </Botao>
            )}
            <Botao variante="claro" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={enviando} textoCarregando="Salvando...">
              {ingrediente ? "Salvar" : "Criar ingrediente"}
            </Botao>
          </div>
        )}
      </form>
    </Dialogo>
  );
}
