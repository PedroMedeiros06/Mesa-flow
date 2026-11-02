import {
  orderSchema,
  sellableMenuSchema,
  type Order,
  type OrderInput,
  type SellableMenu,
  type StatusChange,
} from "@mesaflow/shared";
import { sessao } from "@/lib/sessao";

const corpo = (method: string, dados: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(dados),
});

const pedir = (caminho: string, init?: RequestInit) => sessao.requisicao("membro", caminho, init);

export const apiPedidos = {
  async cardapio(): Promise<SellableMenu> {
    return sellableMenuSchema.parse(await (await pedir("/orders/menu")).json());
  },
  async criar(dados: OrderInput): Promise<Order> {
    return orderSchema.parse(await (await pedir("/orders", corpo("POST", dados))).json());
  },
  /** Fila da cozinha: novos, em preparo e prontos. */
  async fila(): Promise<Order[]> {
    return orderSchema.array().parse(await (await pedir("/orders")).json());
  },
  /** Todos os pedidos de um dia (AAAA-MM-DD); sem data = hoje. */
  async doDia(data?: string): Promise<Order[]> {
    const q = new URLSearchParams({ scope: "dia", ...(data ? { date: data } : {}) });
    return orderSchema.array().parse(await (await pedir(`/orders?${q}`)).json());
  },
  async mudarStatus(id: string, dados: StatusChange): Promise<Order> {
    return orderSchema.parse(await (await pedir(`/orders/${id}/status`, corpo("PATCH", dados))).json());
  },
  async cancelar(id: string, reason: string): Promise<Order> {
    return orderSchema.parse(await (await pedir(`/orders/${id}/cancel`, corpo("POST", { reason }))).json());
  },
};
