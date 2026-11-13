import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { geoArea, geoMercator, geoPath } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import { Botao } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { loadMunicipalities, loadStates, normalizeName, UF_BY_CODE, type AreaFeatures, type StateMunicipalities } from "./geo";

export type ContagemEstado = { state: string; companies: number };
export type ContagemCidade = { state: string; city: string; companies: number };

const LARGURA = 560;
const ALTURA = 540;

/** Degrau da cor pela quantidade de restaurantes (0 = sem restaurante). Cores em mapa.css, por tema. */
const degrau = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n < 5 ? 2 : n < 10 ? 3 : 4);

const plural = (n: number) => `${n} ${n === 1 ? "restaurante ativo" : "restaurantes ativos"}`;

type Forma = { code: string; d: string; centroid: [number, number] };

/**
 * O IBGE entrega os polígonos no sentido anti-horário (RFC 7946); o d3 lê esse sentido como
 * "o globo inteiro menos a área". Inverte os anéis quando a área passa de meia esfera.
 */
function rebobinar<T extends Feature<Geometry>>(feature: T): T {
  if (geoArea(feature) <= 2 * Math.PI) return feature;
  const { geometry } = feature;
  if (geometry.type === "Polygon") {
    return { ...feature, geometry: { ...geometry, coordinates: geometry.coordinates.map((r) => [...r].reverse()) } };
  }
  if (geometry.type === "MultiPolygon") {
    return { ...feature, geometry: { ...geometry, coordinates: geometry.coordinates.map((p) => p.map((r) => [...r].reverse())) } };
  }
  return feature;
}

function projetar(bruto: AreaFeatures): Forma[] {
  const features: AreaFeatures = { ...bruto, features: bruto.features.map(rebobinar) };
  const projecao = geoMercator().fitExtent(
    [
      [8, 8],
      [LARGURA - 8, ALTURA - 8],
    ],
    features,
  );
  const caminho = geoPath(projecao);
  return features.features.map((f) => ({ code: f.properties.codarea, d: caminho(f) ?? "", centroid: caminho.centroid(f) }));
}

/** Mapa do Brasil com restaurantes ativos por estado; clicar num estado mostra as cidades. */
export function MapaBrasil({
  porEstado,
  porCidade,
  semEndereco,
}: {
  porEstado: ContagemEstado[];
  porCidade: ContagemCidade[];
  semEndereco: number;
}) {
  const [estados, setEstados] = useState<AreaFeatures | null>(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    loadStates()
      .then(setEstados)
      .catch((e: Error) => setErro(e.message));
  }, []);

  const porUf = useMemo(() => new Map(porEstado.map((s) => [s.state, s.companies])), [porEstado]);

  if (erro) return <Mensagem>{erro}</Mensagem>;
  if (!estados) return <Mensagem>Carregando o mapa...</Mensagem>;

  return aberto ? (
    <VistaEstado
      key={aberto}
      ufCode={aberto}
      cidades={porCidade.filter((c) => c.state === UF_BY_CODE[aberto]?.uf)}
      aoVoltar={() => setAberto(null)}
    />
  ) : (
    <VistaPais estados={estados} porUf={porUf} ranking={porEstado} semEndereco={semEndereco} aoEscolher={setAberto} />
  );
}

function VistaPais({
  estados,
  porUf,
  ranking,
  semEndereco,
  aoEscolher,
}: {
  estados: AreaFeatures;
  porUf: Map<string, number>;
  ranking: ContagemEstado[];
  semEndereco: number;
  aoEscolher: (code: string) => void;
}) {
  const formas = useMemo(() => projetar(estados), [estados]);
  const codigoPorUf = useMemo(() => new Map(Object.entries(UF_BY_CODE).map(([code, s]) => [s.uf, code])), []);
  const maior = Math.max(1, ...ranking.map((r) => r.companies));

  return (
    <div className="mapa-grade">
      <Tela
        formas={formas}
        contagem={(code) => porUf.get(UF_BY_CODE[code]?.uf ?? "") ?? 0}
        nome={(code) => UF_BY_CODE[code]?.name ?? code}
        rotulo={(code) => UF_BY_CODE[code]?.uf}
        aoEscolher={aoEscolher}
      />
      <div className="mapa-lado">
        <p className="suave">Clique num estado para ver as cidades.</p>
        {ranking.length === 0 ? (
          <p className="suave">Nenhum restaurante ativo com endereço cadastrado.</p>
        ) : (
          <ul className="mapa-ranking">
            {ranking.map((r) => {
              const code = codigoPorUf.get(r.state);
              return (
                <li key={r.state}>
                  <button type="button" disabled={!code} onClick={() => code && aoEscolher(code)}>
                    <span className="mapa-ranking-linha">
                      <span>{code ? UF_BY_CODE[code]!.name : r.state}</span>
                      <strong className="num">{r.companies}</strong>
                    </span>
                    <span className="mapa-barra">
                      <span style={{ width: `${(r.companies / maior) * 100}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {semEndereco > 0 && (
          <p className="suave mapa-nota">
            {semEndereco === 1
              ? "1 restaurante ativo sem endereço não aparece no mapa."
              : `${semEndereco} restaurantes ativos sem endereço não aparecem no mapa.`}
          </p>
        )}
      </div>
    </div>
  );
}

function VistaEstado({ ufCode, cidades, aoVoltar }: { ufCode: string; cidades: ContagemCidade[]; aoVoltar: () => void }) {
  const [dados, setDados] = useState<StateMunicipalities | null>(null);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const estado = UF_BY_CODE[ufCode];

  useEffect(() => {
    let cancelado = false;
    setErro("");
    loadMunicipalities(ufCode)
      .then((r) => !cancelado && setDados(r))
      .catch((e: Error) => !cancelado && setErro(e.message));
    return () => {
      cancelado = true;
    };
  }, [ufCode, tentativa]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoVoltar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoVoltar]);

  // O endereço guarda o nome da cidade: casa com o município do IBGE pelo nome sem acento.
  const porCodigo = useMemo(() => {
    const contagem = new Map<string, number>();
    if (!dados) return contagem;
    const codigoPorNome = new Map([...dados.names].map(([code, nome]) => [normalizeName(nome), code]));
    for (const c of cidades) {
      const code = codigoPorNome.get(normalizeName(c.city));
      if (code) contagem.set(code, (contagem.get(code) ?? 0) + c.companies);
    }
    return contagem;
  }, [dados, cidades]);

  const formas = useMemo(() => (dados ? projetar(dados.features) : []), [dados]);
  const total = cidades.reduce((s, c) => s + c.companies, 0);

  return (
    <div className="mapa-grade">
      <div className="mapa-estado">
        <div className="mapa-voltar">
          <Botao variante="claro" pequeno icone="voltar" onClick={aoVoltar}>
            Brasil
          </Botao>
          <strong>{estado?.name}</strong>
        </div>
        {erro ? (
          <Mensagem>
            {erro}
            <Botao variante="contorno" pequeno onClick={() => setTentativa((n) => n + 1)}>
              Tentar de novo
            </Botao>
          </Mensagem>
        ) : !dados ? (
          <Mensagem>Carregando as cidades...</Mensagem>
        ) : (
          <Tela formas={formas} contagem={(code) => porCodigo.get(code) ?? 0} nome={(code) => dados.names.get(code) ?? code} fino />
        )}
      </div>
      <div className="mapa-lado">
        <p className="suave">
          {total === 0
            ? "Nenhum restaurante ativo neste estado."
            : `${plural(total)} em ${cidades.length} ${cidades.length === 1 ? "cidade" : "cidades"}.`}
        </p>
        <ul className="mapa-cidades">
          {cidades.map((c) => (
            <li key={c.city}>
              <span>{c.city}</span>
              <strong className="num">{c.companies}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type Dica = { x: number; y: number; titulo: string; n: number };

function Tela({
  formas,
  contagem,
  nome,
  rotulo,
  aoEscolher,
  fino,
}: {
  formas: Forma[];
  contagem: (code: string) => number;
  nome: (code: string) => string;
  rotulo?: (code: string) => string | undefined;
  aoEscolher?: (code: string) => void;
  /** Divisas finas para muitos polígonos (municípios). */
  fino?: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [dica, setDica] = useState<Dica | null>(null);

  const seguir = (code: string) => (e: MouseEvent) => {
    const r = caixa.current?.getBoundingClientRect();
    if (!r) return;
    setDica({ x: e.clientX - r.left, y: e.clientY - r.top, titulo: nome(code), n: contagem(code) });
  };

  return (
    <div ref={caixa} className="mapa-tela" onMouseLeave={() => setDica(null)}>
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img" aria-label="Mapa de restaurantes ativos">
        {formas.map((f) => (
          <path
            key={f.code}
            d={f.d}
            data-degrau={degrau(contagem(f.code))}
            data-clicavel={aoEscolher ? "" : undefined}
            onMouseMove={seguir(f.code)}
            onClick={aoEscolher ? () => aoEscolher(f.code) : undefined}
            strokeWidth={fino ? 0.4 : 1}
          />
        ))}
        {rotulo &&
          formas
            .filter((f) => contagem(f.code) > 0)
            .map((f) => (
              <text key={f.code} x={f.centroid[0]} y={f.centroid[1]} data-degrau={degrau(contagem(f.code))}>
                {rotulo(f.code)}
              </text>
            ))}
      </svg>
      {dica && (
        <div className="mapa-dica" style={{ left: dica.x, top: dica.y }}>
          <strong>{dica.titulo}</strong>
          <span>{dica.n ? plural(dica.n) : "Nenhum restaurante"}</span>
        </div>
      )}
    </div>
  );
}

function Mensagem({ children }: { children: ReactNode }) {
  return (
    <div className="mapa-mensagem">
      <Icone nome="loja" tamanho={20} />
      {children}
    </div>
  );
}
