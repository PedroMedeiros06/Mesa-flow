import { formatMoney, ORDER_ORIGIN_LABELS, PAYMENT_LABELS, type Order } from "@mesaflow/shared";

export function minutosDesde(iso: string, agora: number) {
  return Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60_000));
}

export function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** O que sai na impressora térmica de 80 mm. Fica escondido na tela; só aparece na impressão. */
export function TicketImpresso({ pedido, restaurante }: { pedido: Order; restaurante: string }) {
  return (
    <div className="so-impressao" aria-hidden="true">
      <div>{restaurante}</div>
      <h1>Pedido {pedido.number}</h1>
      <div>
        {pedido.tabLabel ?? ORDER_ORIGIN_LABELS[pedido.origin]}, {hora(pedido.createdAt)}
        {pedido.customerName && `, ${pedido.customerName}`}
      </div>
      <hr />
      <ul>
        {pedido.items.filter((i) => !i.cancelled).map((i) => (
          <li key={i.id}>
            <strong>
              {i.quantity}x {i.name}
            </strong>
            {i.addons.map((a) => (
              <div key={a.name}>+ {a.name}</div>
            ))}
            {i.removed.map((r) => (
              <div key={r}>SEM {r.toUpperCase()}</div>
            ))}
            {i.notes && <div>Obs.: {i.notes}</div>}
          </li>
        ))}
      </ul>
      {pedido.notes && (
        <>
          <hr />
          <div>Obs.: {pedido.notes}</div>
        </>
      )}
      <hr />
      <div>
        {pedido.tabLabel ? "Rodada" : "Total"} {formatMoney(pedido.totalCents)}
        {pedido.paymentMethod && ` (${PAYMENT_LABELS[pedido.paymentMethod]})`}
      </div>
    </div>
  );
}
