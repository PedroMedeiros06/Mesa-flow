import { useState, type FormEvent, type ReactNode } from "react";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Campo, Dialogo, type VarianteBotao } from "@/ui/componentes";

/** Confirmação que pede um motivo (cancelar item, estornar pagamento, reabrir). */
export function PedirMotivo({
  titulo,
  texto,
  rotuloBotao,
  textoCarregando,
  variante = "perigo",
  exemplo,
  aoFechar,
  aoConfirmar,
}: {
  titulo: string;
  texto: ReactNode;
  rotuloBotao: string;
  textoCarregando: string;
  variante?: VarianteBotao;
  exemplo: string;
  aoFechar: () => void;
  /** Lança ApiErro para mostrar a mensagem no diálogo. */
  aoConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [erroCampo, setErroCampo] = useState<string>();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 3) {
      setErroCampo("Diga o motivo");
      return;
    }
    setErroCampo(undefined);
    setEnviando(true);
    try {
      await aoConfirmar(motivo.trim());
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível salvar. Tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={titulo}>
      <form onSubmit={confirmar} noValidate style={{ display: "grid", gap: 16 }}>
        <p className="suave">{texto}</p>
        {erro && <Aviso>{erro}</Aviso>}
        <Campo
          rotulo="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          erro={erroCampo}
          maxLength={200}
          placeholder={exemplo}
          autoFocus
        />
        <div className="dialogo-acoes">
          <Botao variante="claro" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao type="submit" variante={variante} carregando={enviando} textoCarregando={textoCarregando}>
            {rotuloBotao}
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}
