// Dados fictícios só para os protótipos da etapa 4.

export const restaurante = { nome: "Cantina da Vila", codigo: "482915" };

export type StatusMesa = "livre" | "ocupada" | "conta" | "atencao";

export interface Mesa {
  numero: number;
  status: StatusMesa;
  pessoas?: number;
  abertaHa?: string;
  totalCentavos?: number;
  garcom?: string;
}

export const mesas: Mesa[] = [
  { numero: 1, status: "ocupada", pessoas: 4, abertaHa: "52 min", totalCentavos: 18740, garcom: "Rafa" },
  { numero: 2, status: "livre" },
  { numero: 3, status: "conta", pessoas: 2, abertaHa: "1 h 20", totalCentavos: 9650, garcom: "Rafa" },
  { numero: 4, status: "ocupada", pessoas: 6, abertaHa: "18 min", totalCentavos: 24300, garcom: "Bia" },
  { numero: 5, status: "atencao", pessoas: 3, abertaHa: "35 min", totalCentavos: 6200, garcom: "Bia" },
  { numero: 6, status: "livre" },
  { numero: 7, status: "ocupada", pessoas: 2, abertaHa: "9 min", totalCentavos: 3800, garcom: "Rafa" },
  { numero: 8, status: "livre" },
  { numero: 9, status: "ocupada", pessoas: 5, abertaHa: "41 min", totalCentavos: 21170, garcom: "Léo" },
  { numero: 10, status: "livre" },
  { numero: 11, status: "conta", pessoas: 4, abertaHa: "1 h 05", totalCentavos: 15890, garcom: "Léo" },
  { numero: 12, status: "livre" },
];

export type StatusPedido = "novo" | "preparo" | "pronto";

export interface ItemPedido {
  qtd: number;
  nome: string;
  obs?: string;
}

export interface Pedido {
  numero: number;
  origem: string;
  ha: string;
  atrasado?: boolean;
  status: StatusPedido;
  itens: ItemPedido[];
}

export const pedidos: Pedido[] = [
  {
    numero: 214,
    origem: "Mesa 4",
    ha: "2 min",
    status: "novo",
    itens: [
      { qtd: 2, nome: "Parmegiana de frango" },
      { qtd: 1, nome: "Fritas média", obs: "sem sal" },
      { qtd: 3, nome: "Guaraná lata" },
    ],
  },
  {
    numero: 215,
    origem: "Vitrine, retirada",
    ha: "1 min",
    status: "novo",
    itens: [{ qtd: 1, nome: "Lasanha bolonhesa" }],
  },
  {
    numero: 209,
    origem: "Mesa 5",
    ha: "24 min",
    atrasado: true,
    status: "preparo",
    itens: [
      { qtd: 1, nome: "Filé à parmegiana", obs: "sem cebola" },
      { qtd: 1, nome: "Arroz e feijão extra" },
    ],
  },
  {
    numero: 211,
    origem: "Balcão",
    ha: "11 min",
    status: "preparo",
    itens: [
      { qtd: 2, nome: "Pastel de carne" },
      { qtd: 1, nome: "Caldo de cana 500 ml" },
    ],
  },
  {
    numero: 207,
    origem: "Mesa 1",
    ha: "pronto há 3 min",
    status: "pronto",
    itens: [
      { qtd: 1, nome: "Risoto de camarão" },
      { qtd: 1, nome: "Salada da casa", obs: "molho à parte" },
    ],
  },
];

export interface Produto {
  nome: string;
  descricao: string;
  precoCentavos: number;
  precoAntigoCentavos?: number;
}

export const cardapio: { categoria: string; produtos: Produto[] }[] = [
  {
    categoria: "Massas",
    produtos: [
      { nome: "Lasanha bolonhesa", descricao: "Molho de tomate da casa, carne moída e muçarela gratinada.", precoCentavos: 4290 },
      {
        nome: "Nhoque ao sugo",
        descricao: "Nhoque de batata feito no dia, manjericão fresco.",
        precoCentavos: 3490,
        precoAntigoCentavos: 3990,
      },
      { nome: "Talharim ao alho e óleo", descricao: "Com brócolis e parmesão.", precoCentavos: 3190 },
    ],
  },
  {
    categoria: "Pratos",
    produtos: [
      { nome: "Parmegiana de frango", descricao: "Acompanha arroz e fritas. Serve 1 pessoa.", precoCentavos: 3890 },
      { nome: "Filé à parmegiana", descricao: "Filé mignon, arroz e fritas.", precoCentavos: 5690 },
    ],
  },
  {
    categoria: "Bebidas",
    produtos: [
      { nome: "Guaraná lata", descricao: "350 ml", precoCentavos: 650 },
      { nome: "Suco de laranja", descricao: "500 ml, feito na hora", precoCentavos: 1100 },
    ],
  },
];

export const resumoDia = {
  vendasCentavos: 384620,
  pedidos: 71,
  ticketCentavos: 5417,
  mesasAbertas: 7,
  maisVendidos: [
    { nome: "Parmegiana de frango", qtd: 23 },
    { nome: "Lasanha bolonhesa", qtd: 17 },
    { nome: "Guaraná lata", qtd: 15 },
    { nome: "Pastel de carne", qtd: 12 },
    { nome: "Filé à parmegiana", qtd: 9 },
  ],
  porHora: [2, 3, 1, 0, 0, 4, 11, 16, 9, 3, 2, 7, 13],
};

export function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
