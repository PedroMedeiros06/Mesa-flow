import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { can, type WaiterCall } from "@mesaflow/shared";
import { bipar, BIPE_CHAMADO, vibrar } from "@/lib/bipe";
import { ApiErro } from "@/lib/http";
import { useSessao } from "@/lib/useSessao";
import { Botao } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { minutosDesde } from "../pedidos/ticket";
import { apiMesas } from "./api";
import "./alerta-chamados.css";

/** Chamado é urgente: lê bem mais vezes que o mapa de mesas. */
const INTERVALO_MS = 5_000;
/** Enquanto ninguém atende, o alerta toca de novo neste intervalo. */
const REPETIR_MS = 30_000;
/** Disparado quando alguém marca um chamado como atendido em outra parte da tela. */
export const EVENTO_CHAMADO_ATENDIDO = "mesaflow:chamado-atendido";

/**
 * Faixa no topo de todas as telas do painel quando um cliente chama o garçom pelo QR.
 * Toca som e vibra o celular em qualquer tela (não só em Mesas). Vai para todos da equipe que veem as mesas.
 */
export function AlertaChamados() {
  const atual = useSessao("membro");
  const membro = atual?.profile.member;
  const podeVer = !!membro && can(membro.role, membro.permissions, "tabs.view");
  const navegar = useNavigate();

  const [chamados, setChamados] = useState<WaiterCall[]>([]);
  const [agora, setAgora] = useState(() => Date.now());
  const [atendendo, setAtendendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [somPronto, setSomPronto] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const tocouEm = useRef(new Map<string, number>());

  // O navegador só deixa tocar som depois de um toque na página: o primeiro toque em qualquer lugar libera.
  useEffect(() => {
    if (!podeVer) return;
    const liberar = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume().then(() => setSomPronto(audio.current?.state === "running"));
    };
    window.addEventListener("pointerdown", liberar);
    window.addEventListener("keydown", liberar);
    return () => {
      window.removeEventListener("pointerdown", liberar);
      window.removeEventListener("keydown", liberar);
    };
  }, [podeVer]);

  useEffect(() => () => void audio.current?.close(), []);

  const carregar = useCallback(async () => {
    try {
      const lista = await apiMesas.chamados();
      const t = Date.now();
      setAgora(t);
      setChamados(lista);
      // Toca para chamado novo e de novo a cada 30 s enquanto ninguém atende.
      const tocou = tocouEm.current;
      const tocar = lista.some((c) => t - (tocou.get(c.tabId) ?? 0) >= REPETIR_MS);
      for (const id of [...tocou.keys()]) if (!lista.some((c) => c.tabId === id)) tocou.delete(id);
      if (tocar) {
        for (const c of lista) tocou.set(c.tabId, t);
        if (audio.current?.state === "running") bipar(audio.current, BIPE_CHAMADO);
        vibrar();
      }
    } catch (falha) {
      // Sem permissão ou sem conexão: fica quieto; a próxima leitura tenta de novo.
      if (falha instanceof ApiErro && falha.status === 403) setChamados([]);
    }
  }, []);

  useEffect(() => {
    if (!podeVer) return;
    void carregar();
    const id = window.setInterval(() => void carregar(), INTERVALO_MS);
    const reler = () => void carregar();
    window.addEventListener(EVENTO_CHAMADO_ATENDIDO, reler);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(EVENTO_CHAMADO_ATENDIDO, reler);
    };
  }, [podeVer, carregar]);

  async function atender(c: WaiterCall) {
    setAtendendo(c.tabId);
    setAviso(null);
    try {
      await apiMesas.atenderChamado(c.tabId);
      setChamados((l) => l.filter((x) => x.tabId !== c.tabId));
      window.dispatchEvent(new Event(EVENTO_CHAMADO_ATENDIDO));
    } catch (falha) {
      setAviso(falha instanceof ApiErro ? falha.message : "Não foi possível marcar. Tente de novo.");
    } finally {
      setAtendendo(null);
    }
  }

  if (!podeVer || chamados.length === 0) return null;

  return (
    <section className="alerta-chamados" role="alert" aria-label="Mesas chamando o garçom">
      <ul>
        {chamados.map((c) => {
          const min = minutosDesde(c.createdAt, agora);
          return (
            <li key={c.tabId}>
              <Icone nome="sino" tamanho={20} />
              <span className="alerta-texto">
                <strong>{c.label}</strong> chamando {min < 1 ? "agora" : `há ${min} min`}
              </span>
              <span className="alerta-acoes">
                <Botao variante="claro" pequeno onClick={() => navegar(`/app/mesas?mesa=${c.tabId}`)}>
                  Ver mesa
                </Botao>
                <Botao pequeno carregando={atendendo === c.tabId} textoCarregando="Marcando..." onClick={() => void atender(c)}>
                  Atendido
                </Botao>
              </span>
            </li>
          );
        })}
      </ul>
      {!somPronto && <p className="alerta-dica">Toque em qualquer lugar da tela para ligar o som dos chamados.</p>}
      {aviso && <p className="alerta-dica">{aviso}</p>}
    </section>
  );
}
