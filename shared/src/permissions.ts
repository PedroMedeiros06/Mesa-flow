// Lista única de permissões do restaurante. O banco guarda estas chaves, o backend confere
// estas chaves e o frontend monta a tela de equipe a partir desta lista. Não existe outro formato.
export const PERMISSIONS = {
  "orders.view": { group: "Pedidos", label: "Ver pedidos e a fila da cozinha" },
  "orders.create": { group: "Pedidos", label: "Lançar pedidos no balcão" },
  "orders.change_status": { group: "Pedidos", label: "Avançar o status dos pedidos" },
  "orders.cancel": { group: "Pedidos", label: "Cancelar pedidos e itens" },
  "orders.discount": { group: "Pedidos", label: "Dar desconto no pedido" },

  "tabs.view": { group: "Mesas", label: "Ver mesas e comandas" },
  "tabs.open": { group: "Mesas", label: "Abrir comandas e lançar rodadas" },
  "tabs.transfer": { group: "Mesas", label: "Transferir rodadas e juntar mesas" },
  "tabs.close": { group: "Mesas", label: "Registrar pagamentos e fechar a conta" },
  "tabs.reopen": { group: "Mesas", label: "Reabrir comanda fechada" },

  "catalog.manage": { group: "Cardápio", label: "Editar produtos, categorias e preços" },
  "stock.manage": { group: "Estoque", label: "Editar ingredientes e ajustar estoque" },

  "reports.view": { group: "Gestão", label: "Ver faturamento e relatórios" },
  "members.manage": { group: "Gestão", label: "Gerenciar a equipe" },
  "company.manage": { group: "Gestão", label: "Alterar os dados do restaurante" },
} as const satisfies Record<string, { group: string; label: string }>;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

export const MEMBER_ROLES = ["owner", "employee"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

// O dono sempre pode tudo; o funcionário só o que estiver na lista dele.
export function can(role: MemberRole, granted: readonly string[], needed: Permission): boolean {
  return role === "owner" || granted.includes(needed);
}
