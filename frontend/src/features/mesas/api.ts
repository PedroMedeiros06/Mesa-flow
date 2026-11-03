import {
  tabDetailSchema,
  tabSummarySchema,
  type TabDetail,
  type TabOpenInput,
  type TabPaymentInput,
  type TabRoundInput,
  type TabSummary,
} from "@mesaflow/shared";
import { sessao } from "@/lib/sessao";

const corpo = (method: string, dados: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(dados),
});

const pedir = (caminho: string, init?: RequestInit) => sessao.requisicao("membro", caminho, init);
const detalhe = async (caminho: string, init?: RequestInit): Promise<TabDetail> =>
  tabDetailSchema.parse(await (await pedir(caminho, init)).json());

export const apiMesas = {
  /** Abertas (mapa) ou fechadas hoje. */
  async listar(scope: "abertas" | "hoje"): Promise<TabSummary[]> {
    return tabSummarySchema.array().parse(await (await pedir(`/tabs?scope=${scope}`)).json());
  },
  ver: (id: string) => detalhe(`/tabs/${id}`),
  abrir: (dados: TabOpenInput) => detalhe("/tabs", corpo("POST", dados)),
  lancar: (id: string, dados: TabRoundInput) => detalhe(`/tabs/${id}/rounds`, corpo("POST", dados)),
  cancelarItem: (id: string, itemId: string, reason: string) =>
    detalhe(`/tabs/${id}/items/${itemId}/cancel`, corpo("POST", { reason })),
  transferir: (id: string, orderId: string, toTabId: string) =>
    detalhe(`/tabs/${id}/rounds/${orderId}/transfer`, corpo("POST", { toTabId })),
  juntar: (id: string, intoTabId: string) => detalhe(`/tabs/${id}/merge`, corpo("POST", { intoTabId })),
  taxa: (id: string, serviceFeeBps: number) => detalhe(`/tabs/${id}/service-fee`, corpo("PATCH", { serviceFeeBps })),
  pagar: (id: string, dados: TabPaymentInput) => detalhe(`/tabs/${id}/payments`, corpo("POST", dados)),
  estornar: (id: string, paymentId: string, reason: string) =>
    detalhe(`/tabs/${id}/payments/${paymentId}/void`, corpo("POST", { reason })),
  fechar: (id: string) => detalhe(`/tabs/${id}/close`, { method: "POST" }),
  reabrir: (id: string, reason: string) => detalhe(`/tabs/${id}/reopen`, corpo("POST", { reason })),
};
