// Ícones de traço simples, 24x24, desenhados para o MesaFlow.
const caminhos = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  relogio: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  alerta: "M12 8v5M12 16.5v.5M10.3 3.9L2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  conta: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  pessoas: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18.5 14.5A6.5 6.5 0 0 1 21.5 20",
  mais: "M12 5v14M5 12h14",
  sacola: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2",
  inicio: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
  mesa: "M3 9h18M5 9l-1 11M19 9l1 11M8 9V5h8v4",
  balcao: "M3 10h18v10H3zM6 10V6h12v4M8 15h3",
  cozinha: "M12 3c3 3.5 5 6 5 9a5 5 0 0 1-10 0c0-1.5.7-3 1.6-4 .2 1.8 1 2.8 2.4 3.3C10.5 8.5 11 5.5 12 3zM8 21h8",
  pedidos: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  cardapio: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11",
  estoque: "M3 8l9-5 9 5v9l-9 5-9-5zM3 8l9 5 9-5M12 13v9",
  equipe: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  ajustes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  impressora: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  busca: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  whatsapp: "M4 20l1.3-3.9A8 8 0 1 1 8 19zM9 9.5c.3 2.5 2.4 4.6 5 5l1.2-1.2 2 1-.5 1.5c-4.5.5-8.6-3.6-8.1-8.1L10 7.2l1 2z",
  sair: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10",
  grade: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  cadeado: "M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11",
  loja: "M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6",
  cobranca: "M3 6h18v12H3zM3 10h18M7 15h4",
} as const;

export type NomeIcone = keyof typeof caminhos;

export function Icone({ nome, tamanho = 20 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={caminhos[nome]} />
    </svg>
  );
}
