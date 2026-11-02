/** Formata o CPF enquanto a pessoa digita: 12345678901 vira 123.456.789-01. */
export function mascaraCpf(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

export function saudacao(agora = new Date()): string {
  const h = agora.getHours();
  if (h < 5 || h >= 18) return "Boa noite";
  if (h < 12) return "Bom dia";
  return "Boa tarde";
}
