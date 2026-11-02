import { useState, type FormEvent } from "react";
import type { Order } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Campo, Dialogo } from "@/ui/componentes";
import { apiPedidos } from "./api";

/** Cancelar com motivo. O estoque do pedido volta inteiro. */
export function CancelarPedido({
  pedido,
  aoFechar,
  aoCancelar,
}: {
  pedido: Order;
  aoFechar: () => void;
  aoCancelar: (p: Order) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erroCampo, setErroCampo] = useState<string>();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cancelar(e: FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 3) {
      setErroCampo("Diga o motivo do cancelamento");
      return;
    }
    setErroCampo(undefined);
    setEnviando(true);
    try {
      aoCancelar(await apiPedidos.cancelar(pedido.id, motivo));
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível cancelar. Tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={`Cancelar o pedido ${pedido.number}?`}>
      <form onSubmit={cancelar} noValidate style={{ display: "grid", gap: 16 }}>
        <p className="suave">Os ingredientes voltam para o estoque. O pedido fica na lista do dia como cancelado.</p>
        {erro && <Aviso>{erro}</Aviso>}
        <Campo
          rotulo="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          erro={erroCampo}
          maxLength={200}
          placeholder="Ex.: cliente desistiu, lançado errado"
          autoFocus
        />
        <div className="dialogo-acoes">
          <Botao variante="claro" onClick={aoFechar}>
            Manter pedido
          </Botao>
          <Botao type="submit" variante="perigo" carregando={enviando} textoCarregando="Cancelando...">
            Cancelar pedido
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}
