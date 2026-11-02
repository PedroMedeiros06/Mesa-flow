// Dinheiro sempre em centavos (inteiro). Texto só na borda: o que a pessoa digita e o que ela lê.

/** Maior preço aceito: R$ 100.000,00. */
export const MAX_CENTS = 10_000_000;

/**
 * Converte o que a pessoa digitou em centavos. Aceita "12", "12,5", "12,50", "1.234,56", "R$ 12,50" e "12.50".
 * Devolve null para texto vazio, negativo, com mais de 2 casas ou fora do limite.
 */
export function parseMoney(texto: string): number | null {
  let t = texto.replace(/\s|R\$/g, "");
  if (!t) return null;
  if (t.includes(",")) {
    // formato brasileiro: ponto é separador de milhar
    if (!/^\d{1,3}(\.\d{3})*,\d{0,2}$|^\d+,\d{0,2}$/.test(t)) return null;
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(t)) {
    // "12.50": ponto como decimal
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  } else if (!/^\d+$/.test(t)) {
    return null;
  }
  const [inteiro = "0", fracao = ""] = t.split(".");
  const cents = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return cents;
}

/** 1250 vira "R$ 12,50". */
export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** 1250 vira "12,50" (para preencher um campo de preço). */
export function moneyToInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
