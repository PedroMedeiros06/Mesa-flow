import type { FeatureCollection, Geometry } from "geojson";

// Malhas do IBGE (trazido do projeto Conferência de Caixa). A dos estados vai junto do app (public/geo); a dos
// municípios de cada estado é baixada da API do IBGE só quando o estado é aberto.

export type AreaFeatures = FeatureCollection<Geometry, { codarea: string }>;

/** Código IBGE da UF → sigla e nome. */
export const UF_BY_CODE: Record<string, { uf: string; name: string }> = {
  "11": { uf: "RO", name: "Rondônia" },
  "12": { uf: "AC", name: "Acre" },
  "13": { uf: "AM", name: "Amazonas" },
  "14": { uf: "RR", name: "Roraima" },
  "15": { uf: "PA", name: "Pará" },
  "16": { uf: "AP", name: "Amapá" },
  "17": { uf: "TO", name: "Tocantins" },
  "21": { uf: "MA", name: "Maranhão" },
  "22": { uf: "PI", name: "Piauí" },
  "23": { uf: "CE", name: "Ceará" },
  "24": { uf: "RN", name: "Rio Grande do Norte" },
  "25": { uf: "PB", name: "Paraíba" },
  "26": { uf: "PE", name: "Pernambuco" },
  "27": { uf: "AL", name: "Alagoas" },
  "28": { uf: "SE", name: "Sergipe" },
  "29": { uf: "BA", name: "Bahia" },
  "31": { uf: "MG", name: "Minas Gerais" },
  "32": { uf: "ES", name: "Espírito Santo" },
  "33": { uf: "RJ", name: "Rio de Janeiro" },
  "35": { uf: "SP", name: "São Paulo" },
  "41": { uf: "PR", name: "Paraná" },
  "42": { uf: "SC", name: "Santa Catarina" },
  "43": { uf: "RS", name: "Rio Grande do Sul" },
  "50": { uf: "MS", name: "Mato Grosso do Sul" },
  "51": { uf: "MT", name: "Mato Grosso" },
  "52": { uf: "GO", name: "Goiás" },
  "53": { uf: "DF", name: "Distrito Federal" },
};

/** Nome sem acento e em minúsculas, para casar cidade digitada com o IBGE. */
export const normalizeName = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

let statesCache: Promise<AreaFeatures> | null = null;

export function loadStates() {
  statesCache ??= fetch("/geo/br-uf.json").then((response) => {
    if (!response.ok) throw new Error("Não foi possível carregar o mapa.");
    return response.json() as Promise<AreaFeatures>;
  });
  statesCache.catch(() => (statesCache = null));
  return statesCache;
}

export type StateMunicipalities = {
  features: AreaFeatures;
  /** Código IBGE do município → nome. */
  names: Map<string, string>;
};

const IBGE = "https://servicodados.ibge.gov.br/api";
const municipalitiesCache = new Map<string, Promise<StateMunicipalities>>();

export function loadMunicipalities(ufCode: string) {
  let cached = municipalitiesCache.get(ufCode);
  if (!cached) {
    cached = Promise.all([
      fetch(
        `${IBGE}/v3/malhas/estados/${ufCode}?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio`,
      ),
      fetch(`${IBGE}/v1/localidades/estados/${ufCode}/municipios`),
    ]).then(async ([shapes, list]) => {
      if (!shapes.ok || !list.ok) {
        throw new Error("Não foi possível carregar as cidades deste estado.");
      }
      const features = (await shapes.json()) as AreaFeatures;
      const municipalities = (await list.json()) as { id: number; nome: string }[];
      return {
        features,
        names: new Map(municipalities.map((m) => [String(m.id), m.nome])),
      };
    });
    cached.catch(() => municipalitiesCache.delete(ufCode));
    municipalitiesCache.set(ufCode, cached);
  }
  return cached;
}
