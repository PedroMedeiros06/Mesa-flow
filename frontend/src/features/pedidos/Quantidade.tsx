import { MAX_ITEM_QUANTITY } from "@mesaflow/shared";
import { Icone } from "@/ui/Icone";

/** − 2 +: botões grandes o bastante para o dedo, com o nome do item para o leitor de tela. */
export function Quantidade({
  valor,
  aoMudar,
  nome,
  minimo = 0,
}: {
  valor: number;
  aoMudar: (q: number) => void;
  nome: string;
  minimo?: number;
}) {
  return (
    <span className="qtd" role="group" aria-label={`Quantidade de ${nome}`}>
      <button
        type="button"
        onClick={() => aoMudar(valor - 1)}
        disabled={valor <= minimo}
        aria-label={valor === 1 && minimo === 0 ? `Tirar ${nome}` : `Diminuir ${nome}`}
      >
        <Icone nome={valor === 1 && minimo === 0 ? "fechar" : "menos"} tamanho={16} />
      </button>
      <output className="num" aria-live="polite">
        {valor}
      </output>
      <button type="button" onClick={() => aoMudar(valor + 1)} disabled={valor >= MAX_ITEM_QUANTITY} aria-label={`Aumentar ${nome}`}>
        <Icone nome="mais" tamanho={16} />
      </button>
    </span>
  );
}
