import { useEffect, useState, type FormEvent } from "react";
import { companySettingsInputSchema, companySettingsSchema, type CompanySettings } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { sessao } from "@/lib/sessao";
import { Aviso, Botao, Campo, Comanda } from "@/ui/componentes";
import { errosPorCampo, type ErrosCampos } from "../acesso/erros";
import { SeuPlano } from "./SeuPlano";
import "./ajustes.css";

type CampoAjuste = "name" | "legalName" | "document" | "whatsapp" | "serviceFeeBps";

const corpo = (dados: unknown): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(dados),
});

/** CNPJ 00.000.000/0000-00 ou CPF 000.000.000-00 enquanto digita. */
function mascaraDocumento(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** (11) 99999-8888 enquanto digita. */
function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  const resto = d.slice(2);
  const meio = resto.length > 8 ? 5 : 4;
  return `(${d.slice(0, 2)}) ${resto.slice(0, meio)}${resto.length > meio ? `-${resto.slice(meio)}` : ""}`;
}

/** "10" ou "12,5" (%) para pontos-base; null se não for um número com até duas casas. */
function taxaEmBps(texto: string): number | null {
  const t = texto.trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Tela /app/ajustes: dados do restaurante e o WhatsApp que aparece no cardápio online. */
export function Ajustes() {
  const [atual, setAtual] = useState<CompanySettings | null>(null);
  const [nome, setNome] = useState("");
  const [razao, setRazao] = useState("");
  const [documento, setDocumento] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [taxa, setTaxa] = useState("");
  const [erros, setErros] = useState<ErrosCampos<CampoAjuste>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function preencher(c: CompanySettings) {
    setAtual(c);
    setNome(c.name);
    setRazao(c.legalName ?? "");
    setDocumento(mascaraDocumento(c.document ?? ""));
    setWhatsapp(mascaraTelefone(c.whatsapp ?? ""));
    setTaxa((c.serviceFeeBps / 100).toLocaleString("pt-BR"));
  }

  useEffect(() => {
    sessao
      .requisicao("membro", "/company")
      .then(async (res) => preencher(companySettingsSchema.parse(await res.json())))
      .catch((falha: unknown) => setErro(falha instanceof ApiErro ? falha.message : "Não foi possível carregar os dados."));
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvo(false);
    const bps = taxaEmBps(taxa);
    if (bps === null) {
      setErros({ serviceFeeBps: "Use um número como 10 ou 12,5" });
      return;
    }
    const dados = { name: nome, legalName: razao, document: documento, whatsapp, serviceFeeBps: bps };
    const valido = companySettingsInputSchema.safeParse(dados);
    if (!valido.success) {
      setErros(errosPorCampo<CampoAjuste>(valido.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))));
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      const res = await sessao.requisicao("membro", "/company", corpo(dados));
      preencher(companySettingsSchema.parse(await res.json()));
      setSalvo(true);
      // O nome aparece no menu: relê o perfil para atualizar na hora.
      await sessao.atualizarPerfil("membro").catch(() => undefined);
    } catch (falha) {
      if (falha instanceof ApiErro && falha.issues.length) setErros(errosPorCampo<CampoAjuste>(falha.issues));
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="cab">
        <div>
          <h1>Ajustes</h1>
          <p className="suave" style={{ marginTop: 6 }}>
            Dados do restaurante e o contato que aparece no cardápio online.
          </p>
        </div>
      </div>

      {!atual && !erro && <p className="suave">Carregando...</p>}
      {erro && <Aviso>{erro}</Aviso>}

      {atual && (
        <form className="ajustes" onSubmit={salvar} noValidate>
          <Comanda como="section" aria-label="Restaurante">
            <h2>Restaurante</h2>
            <Campo
              rotulo="Nome do restaurante"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              erro={erros.name}
              maxLength={80}
              ajuda="É o nome que o cliente vê no cardápio online e na página da mesa."
            />
            <Campo
              rotulo="WhatsApp do restaurante"
              inputMode="tel"
              placeholder="(11) 99999-8888"
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascaraTelefone(e.target.value))}
              erro={erros.whatsapp}
              ajuda="Aparece como botão no cardápio online. Deixe vazio para esconder."
            />
            <p className="ajustes-codigo">
              Código de acesso da equipe <strong className="numeral">{atual.code}</strong>
            </p>
          </Comanda>

          <Comanda como="section" aria-label="Dados para nota e contrato">
            <h2>Dados para nota e contrato</h2>
            <Campo rotulo="Razão social" value={razao} onChange={(e) => setRazao(e.target.value)} erro={erros.legalName} maxLength={120} />
            <Campo
              rotulo="CNPJ ou CPF"
              inputMode="numeric"
              value={documento}
              onChange={(e) => setDocumento(mascaraDocumento(e.target.value))}
              erro={erros.document}
            />
          </Comanda>

          <SeuPlano />

          <Comanda como="section" aria-label="Taxa de serviço">
            <h2>Taxa de serviço</h2>
            <Campo
              rotulo="Taxa de serviço (%)"
              inputMode="decimal"
              placeholder="10"
              value={taxa}
              onChange={(e) => setTaxa(e.target.value)}
              erro={erros.serviceFeeBps}
              ajuda="Toda mesa nova abre com esta taxa (de 0 a 20%). Na hora de fechar, dá para tirar a taxa daquela mesa. Mudar aqui não mexe nas mesas já abertas."
            />
          </Comanda>

          <div className="ajustes-acoes">
            {salvo && (
              <p role="status" className="ajustes-salvo">
                Alterações salvas.
              </p>
            )}
            <Botao type="submit" carregando={enviando} textoCarregando="Salvando...">
              Salvar alterações
            </Botao>
          </div>
        </form>
      )}
    </>
  );
}
