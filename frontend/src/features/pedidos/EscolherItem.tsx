import { useState } from "react";
import { formatMoney, MAX_ITEM_QUANTITY, type SellableProduct } from "@mesaflow/shared";
import { Botao, Campo, Dialogo, Marcador } from "@/ui/componentes";
import { precoUnitario, type NovaLinha } from "./carrinho";
import { Quantidade } from "./Quantidade";

/** Adicionais, "sem cebola", observação e quantidade antes de pôr o item no pedido. */
export function EscolherItem({
  produto,
  aoFechar,
  aoAdicionar,
}: {
  produto: SellableProduct;
  aoFechar: () => void;
  aoAdicionar: (linha: NovaLinha) => void;
}) {
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [obs, setObs] = useState("");
  const [quantidade, setQuantidade] = useState(1);

  const alternar = (lista: string[], id: string) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  const total = precoUnitario({ produto, addonIds }) * quantidade;

  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo={produto.name}
      acoes={
        <>
          <Botao variante="claro" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao
            icone="mais"
            onClick={() => aoAdicionar({ produto, quantidade, addonIds, removidos, obs })}
          >
            Adicionar {formatMoney(total)}
          </Botao>
        </>
      }
    >
      <div style={{ display: "grid", gap: 18 }}>
        {produto.description && <p className="suave">{produto.description}</p>}
        {produto.addons.length > 0 && (
          <fieldset className="escolhas">
            <legend>Adicionais</legend>
            {produto.addons.map((a) => (
              <Marcador
                key={a.id}
                rotulo={`${a.name} (+ ${formatMoney(a.priceCents)})`}
                checked={addonIds.includes(a.id)}
                onChange={() => setAddonIds((l) => alternar(l, a.id))}
              />
            ))}
          </fieldset>
        )}
        {produto.removable.length > 0 && (
          <fieldset className="escolhas">
            <legend>Tirar do prato</legend>
            {produto.removable.map((r) => (
              <Marcador
                key={r.ingredientId}
                rotulo={`Sem ${r.name.toLowerCase()}`}
                checked={removidos.includes(r.ingredientId)}
                onChange={() => setRemovidos((l) => alternar(l, r.ingredientId))}
              />
            ))}
          </fieldset>
        )}
        <Campo
          rotulo="Observação para a cozinha (opcional)"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          maxLength={140}
          placeholder="Ex.: bem passada, molho à parte"
        />
        <div className="escolha-qtd">
          <strong>Quantidade</strong>
          <Quantidade valor={quantidade} aoMudar={(q) => setQuantidade(Math.max(1, Math.min(q, MAX_ITEM_QUANTITY)))} nome={produto.name} minimo={1} />
        </div>
      </div>
    </Dialogo>
  );
}
