import { can, type MemberProfile, type Permission, type PlanModule } from "@mesaflow/shared";
import type { NomeIcone } from "@/ui/Icone";

export interface ItemMenu {
  id: string;
  nome: string;
  icone: NomeIcone;
  caminho: string;
  /** Sem permissão = qualquer pessoa da equipe vê. */
  permissao?: Permission;
  /** Recurso do plano que a tela precisa (desligado no plano = a tela some do menu). */
  modulo?: PlanModule;
  /** Etapa do docs/ESTRUTURA.md em que a tela fica pronta. */
  etapa: number;
}

export const MENU_PAINEL: ItemMenu[] = [
  { id: "inicio", nome: "Início", icone: "inicio", caminho: "/app", etapa: 10 },
  { id: "mesas", nome: "Mesas", icone: "mesa", caminho: "/app/mesas", permissao: "tabs.view", modulo: "tabs", etapa: 9 },
  { id: "balcao", nome: "Balcão", icone: "balcao", caminho: "/app/balcao", permissao: "orders.create", etapa: 7 },
  { id: "cozinha", nome: "Cozinha", icone: "cozinha", caminho: "/app/cozinha", permissao: "orders.view", etapa: 7 },
  { id: "pedidos", nome: "Pedidos", icone: "pedidos", caminho: "/app/pedidos", permissao: "orders.view", etapa: 7 },
  { id: "cardapio", nome: "Cardápio", icone: "cardapio", caminho: "/app/cardapio", permissao: "catalog.manage", etapa: 5 },
  { id: "estoque", nome: "Estoque", icone: "estoque", caminho: "/app/estoque", permissao: "stock.manage", modulo: "stock", etapa: 6 },
  { id: "equipe", nome: "Equipe", icone: "equipe", caminho: "/app/equipe", permissao: "members.manage", etapa: 9 },
  { id: "ajustes", nome: "Ajustes", icone: "ajustes", caminho: "/app/ajustes", permissao: "company.manage", etapa: 11 },
];

/** O plano do restaurante inclui o recurso? (sessão antiga sem o campo = tudo liberado) */
export function temModulo(perfil: MemberProfile, modulo?: PlanModule): boolean {
  return !modulo || perfil.company.modules[modulo];
}

export function podeVer(perfil: MemberProfile, item: ItemMenu): boolean {
  return temModulo(perfil, item.modulo) && (!item.permissao || can(perfil.member.role, perfil.member.permissions, item.permissao));
}

export function menuVisivel(perfil: MemberProfile): ItemMenu[] {
  return MENU_PAINEL.filter((item) => podeVer(perfil, item));
}

/** Celular: até 4 atalhos na barra de baixo; o resto vai para "Mais". */
export function dividirParaCelular(itens: ItemMenu[]): { abas: ItemMenu[]; mais: ItemMenu[] } {
  return { abas: itens.slice(0, 4), mais: itens.slice(4) };
}
