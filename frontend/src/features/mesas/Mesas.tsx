import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { can, formatMoney, type Permission, type TabDetail, type TabSummary } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { useSessao } from "@/lib/useSessao";
import { Aviso, Botao, Campo, Dialogo } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { minutosDesde } from "../pedidos/ticket";
import { EVENTO_CHAMADO_ATENDIDO } from "./AlertaChamados";
import { apiMesas } from "./api";
import { Conta, type Pode } from "./Conta";
import { QrMesas } from "./QrMesas";
import { Rodada } from "./Rodada";
import "../pedidos/pedidos.css";
import "./mesas.css";

const INTERVALO_MS = 15_000;

/**
 * Mesas: o mapa das comandas abertas; tocar numa abre a conta; "Nova rodada" abre o cardápio.
 * A mesa escolhida fica no endereço (?mesa=...), então voltar do navegador volta para o mapa.
 */
export function Mesas() {
  const atual = useSessao("membro");
  const membro = atual?.profile.member;
  const tem = (p: Permission) => !!membro && can(membro.role, membro.permissions, p);
  const pode: Pode = {
    lancar: tem("tabs.open"),
    cancelar: tem("orders.cancel"),
    transferir: tem("tabs.transfer"),
    fechar: tem("tabs.close"),
    reabrir: tem("tabs.reopen"),
    qr: tem("company.manage"),
  };

  const [params, setParams] = useSearchParams();
  const selecionada = params.get("mesa");
  const [lancando, setLancando] = useState<TabDetail | null>(null);
  const [versao, setVersao] = useState(0);

  const ir = (id: string | null) => {
    setLancando(null);
    setParams(id ? { mesa: id } : {});
  };

  if (selecionada && lancando?.id === selecionada) {
    return (
      <Rodada
        comanda={lancando}
        aoVoltar={() => setLancando(null)}
        aoLancar={() => {
          setLancando(null);
          setVersao((v) => v + 1);
        }}
      />
    );
  }
  if (selecionada) {
    return <Conta key={`${selecionada}-${versao}`} id={selecionada} pode={pode} aoVoltar={() => ir(null)} aoLancar={setLancando} aoIrPara={ir} />;
  }
  return <Mapa pode={pode} restaurante={atual?.profile.company.name ?? ""} aoAbrir={(c) => ir(c.id)} />;
}

function Mapa({ pode, restaurante, aoAbrir }: { pode: Pode; restaurante: string; aoAbrir: (c: { id: string }) => void }) {
  const [escopo, setEscopo] = useState<"abertas" | "hoje">("abertas");
  const [lista, setLista] = useState<TabSummary[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [abrindo, setAbrindo] = useState(false);
  const [qr, setQr] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setLista(await apiMesas.listar(escopo));
      setAgora(Date.now());
      setErro(null);
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Sem conexão. Tentando de novo...");
    }
  }, [escopo]);

  useEffect(() => {
    setLista(null);
    void carregar();
    const t = window.setInterval(() => void carregar(), INTERVALO_MS);
    const reler = () => void carregar();
    window.addEventListener(EVENTO_CHAMADO_ATENDIDO, reler);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(EVENTO_CHAMADO_ATENDIDO, reler);
    };
  }, [carregar]);

  const total = (lista ?? []).reduce((s, m) => s + m.totals.remainingCents, 0);
  // Quem está chamando o garçom vem primeiro, do chamado mais antigo para o mais novo.
  const ordenada = [...(lista ?? [])].sort((a, b) =>
    a.callingSince && b.callingSince ? a.callingSince.localeCompare(b.callingSince) : a.callingSince ? -1 : b.callingSince ? 1 : 0,
  );

  return (
    <div>
      <div className="cab">
        <div>
          <h1>Mesas</h1>
          {escopo === "abertas" && lista && lista.length > 0 && (
            <p className="suave">
              {lista.length} {lista.length === 1 ? "mesa aberta" : "mesas abertas"}, {formatMoney(total)} a receber
            </p>
          )}
        </div>
        <div className="direita">
          {pode.qr && (
            <Botao variante="claro" icone="qr" onClick={() => setQr(true)}>
              QR das mesas
            </Botao>
          )}
          {pode.lancar && (
            <Botao icone="mais" onClick={() => setAbrindo(true)}>
              Abrir mesa
            </Botao>
          )}
        </div>
      </div>

      <div className="filtros" role="group" aria-label="Quais mesas">
        <button type="button" aria-pressed={escopo === "abertas"} onClick={() => setEscopo("abertas")}>
          Abertas
        </button>
        <button type="button" aria-pressed={escopo === "hoje"} onClick={() => setEscopo("hoje")}>
          Fechadas hoje
        </button>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {!lista && !erro && <p className="suave">Carregando as mesas...</p>}
      {lista && lista.length === 0 && (
        <p className="suave mapa-vazio">
          {escopo === "abertas"
            ? pode.lancar
              ? "Nenhuma mesa aberta. Use “Abrir mesa” quando o cliente sentar."
              : "Nenhuma mesa aberta agora."
            : "Nenhuma conta fechada hoje."}
        </p>
      )}
      {lista && lista.length > 0 && (
        <ul className="mapa">
          {ordenada.map((m) => {
            const min = minutosDesde(m.openedAt, agora);
            const quitada = m.status === "aberta" && m.totals.totalCents > 0 && m.totals.remainingCents === 0;
            const chamando = m.callingSince ? minutosDesde(m.callingSince, agora) : null;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={`mesa ${m.status !== "aberta" ? "mesa-fechada" : ""} ${quitada ? "mesa-quitada" : ""} ${chamando !== null ? "mesa-chamando" : ""}`}
                  onClick={() => aoAbrir(m)}
                >
                  <span className="mesa-num numeral" aria-hidden="true">
                    {m.tableNumber ?? m.label.charAt(0)}
                  </span>
                  <span className="mesa-nome">{m.label}</span>
                  <span className="mesa-valor num">{formatMoney(m.status === "aberta" ? m.totals.remainingCents : m.totals.totalCents)}</span>
                  <span className="mesa-info suave">
                    {m.status === "aberta"
                      ? `${m.rounds} ${m.rounds === 1 ? "rodada" : "rodadas"}, ${min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`}`
                      : "Fechada"}
                    {quitada && ", paga"}
                  </span>
                  {chamando !== null && (
                    <span className="mesa-chamado">
                      <Icone nome="sino" tamanho={16} /> Chamando {chamando < 1 ? "agora" : `há ${chamando} min`}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {qr && <QrMesas restaurante={restaurante} aoFechar={() => setQr(false)} />}

      {abrindo && (
        <AbrirMesa
          aoFechar={() => setAbrindo(false)}
          aoAbrir={(c) => {
            setAbrindo(false);
            aoAbrir(c);
          }}
        />
      )}
    </div>
  );
}

function AbrirMesa({ aoFechar, aoAbrir }: { aoFechar: () => void; aoAbrir: (c: TabDetail) => void }) {
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function abrir(e: FormEvent) {
    e.preventDefault();
    const n = numero.trim() ? Number(numero.trim()) : null;
    const novos: Record<string, string> = {};
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 999)) novos.tableNumber = "Mesa de 1 a 999";
    if (n === null && !nome.trim()) novos.tableNumber = "Informe o número da mesa ou um nome para a comanda";
    setErros(novos);
    if (Object.keys(novos).length) return;
    setEnviando(true);
    setErro(null);
    try {
      aoAbrir(await apiMesas.abrir({ tableNumber: n, label: nome }));
    } catch (falha) {
      setErro(falha instanceof ApiErro ? (falha.issues[0]?.message ?? falha.message) : "Não foi possível abrir. Tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo="Abrir mesa">
      <form onSubmit={abrir} noValidate style={{ display: "grid", gap: 16 }}>
        {erro && <Aviso>{erro}</Aviso>}
        <Campo
          rotulo="Número da mesa"
          inputMode="numeric"
          value={numero}
          onChange={(e) => setNumero(e.target.value.replace(/\D/g, "").slice(0, 3))}
          erro={erros.tableNumber}
          autoFocus
          placeholder="7"
        />
        <Campo
          rotulo="Nome da comanda (opcional)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={40}
          placeholder="Ex.: Varanda, Aniversário da Bia"
          ajuda="Sem número, use um nome (ex.: comanda de balcão)."
        />
        <div className="dialogo-acoes">
          <Botao variante="claro" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao type="submit" carregando={enviando} textoCarregando="Abrindo...">
            Abrir
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}
