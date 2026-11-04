import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { encode } from "uqr";
import type { TableCode } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Campo, Dialogo } from "@/ui/componentes";
import { apiMesas } from "./api";

/** Endereço que vai dentro do QR: a página da mesa no site do MesaFlow. */
export const linkDaMesa = (token: string) => `${window.location.origin}/mesa/${token}`;

/** QR desenhado aqui mesmo (sem serviço de fora, que veria o endereço da mesa). */
export function Qr({ texto, tamanho = 160 }: { texto: string; tamanho?: number }) {
  const { size, data } = encode(texto, { ecc: "M", border: 2 });
  let d = "";
  data.forEach((linha, y) => linha.forEach((preto, x) => preto && (d += `M${x} ${y}h1v1h-1z`)));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={tamanho} height={tamanho} role="img" aria-label="QR code" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/** QR das mesas para imprimir e colar. Trocar o QR de uma mesa invalida o adesivo antigo. */
export function QrMesas({ restaurante, aoFechar }: { restaurante: string; aoFechar: () => void }) {
  const [de, setDe] = useState("1");
  const [ate, setAte] = useState("10");
  const [codigos, setCodigos] = useState<TableCode[] | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [trocando, setTrocando] = useState<number | null>(null);
  const [confirmarTroca, setConfirmarTroca] = useState<number | null>(null);
  const [imprimindo, setImprimindo] = useState(false);

  async function gerar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setGerando(true);
    try {
      setErros({});
      setCodigos(await apiMesas.qrs(Number(de), Number(ate)));
    } catch (falha) {
      if (falha instanceof ApiErro && falha.issues.length) {
        setErros(Object.fromEntries(falha.issues.map((i) => [i.path, i.message])));
      } else {
        setErro(falha instanceof ApiErro ? falha.message : "Não foi possível gerar. Tente de novo.");
      }
    } finally {
      setGerando(false);
    }
  }

  async function trocar(mesa: number) {
    setConfirmarTroca(null);
    setTrocando(mesa);
    try {
      const novo = await apiMesas.trocarQr(mesa);
      setCodigos((l) => (l ?? []).map((c) => (c.tableNumber === mesa ? novo : c)));
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível trocar. Tente de novo.");
    } finally {
      setTrocando(null);
    }
  }

  useEffect(() => {
    if (!imprimindo) return;
    const limpar = () => setImprimindo(false);
    window.addEventListener("afterprint", limpar, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", limpar);
  }, [imprimindo]);

  return (
    <Dialogo
      aberto
      largo
      aoFechar={aoFechar}
      titulo="QR code das mesas"
      acoes={
        <>
          <Botao variante="claro" onClick={aoFechar}>
            Fechar
          </Botao>
          {codigos && codigos.length > 0 && (
            <Botao icone="impressora" onClick={() => setImprimindo(true)}>
              Imprimir
            </Botao>
          )}
        </>
      }
    >
      <p className="suave">
        Cole um QR em cada mesa. O cliente aponta a câmera, vê o que foi pedido, o andamento e o total, e pode chamar o garçom.
        Comandas sem número de mesa não têm QR.
      </p>
      <form className="qr-intervalo" onSubmit={gerar} noValidate>
        <Campo rotulo="Da mesa" inputMode="numeric" value={de} onChange={(e) => setDe(e.target.value.replace(/\D/g, "").slice(0, 3))} erro={erros.from} />
        <Campo rotulo="Até a mesa" inputMode="numeric" value={ate} onChange={(e) => setAte(e.target.value.replace(/\D/g, "").slice(0, 3))} erro={erros.to} />
        <Botao type="submit" variante="contorno" carregando={gerando} textoCarregando="Gerando...">
          Mostrar QR
        </Botao>
      </form>
      {erro && <Aviso>{erro}</Aviso>}

      {codigos && (
        <ul className="qr-grade">
          {codigos.map((c) => (
            <li key={c.tableNumber}>
              <Qr texto={linkDaMesa(c.token)} tamanho={120} />
              <strong>Mesa {c.tableNumber}</strong>
              {confirmarTroca === c.tableNumber ? (
                <span className="qr-confirmar">
                  O adesivo atual para de funcionar.
                  <Botao pequeno variante="perigo" onClick={() => void trocar(c.tableNumber)}>
                    Trocar
                  </Botao>
                  <Botao pequeno variante="claro" onClick={() => setConfirmarTroca(null)}>
                    Voltar
                  </Botao>
                </span>
              ) : (
                <button
                  type="button"
                  className="link-btn"
                  disabled={trocando === c.tableNumber}
                  onClick={() => setConfirmarTroca(c.tableNumber)}
                >
                  {trocando === c.tableNumber ? "Trocando..." : "Trocar QR"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {imprimindo &&
        codigos &&
        createPortal(
          <div className="so-impressao folha-qr" aria-hidden="true">
            {codigos.map((c) => (
              <div key={c.tableNumber} className="folha-qr-cartao">
                <div className="folha-qr-mesa">Mesa {c.tableNumber}</div>
                <Qr texto={linkDaMesa(c.token)} tamanho={190} />
                <div>Aponte a câmera para ver sua conta e chamar o garçom</div>
                <div className="folha-qr-rest">{restaurante}</div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </Dialogo>
  );
}
