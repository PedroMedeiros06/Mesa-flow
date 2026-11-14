import { describe, expect, it } from "vitest";
import type { MemberProfile, Permission } from "@mesaflow/shared";
import { dividirParaCelular, MENU_PAINEL, menuVisivel } from "./menu";

function perfil(
  role: "owner" | "employee",
  permissions: Permission[] = [],
  modules = { tabs: true, stock: true, storefront: true },
): MemberProfile {
  return {
    kind: "member",
    member: { id: "11111111-1111-4111-8111-111111111111", name: "Teste", email: "t@t.com", role, permissions },
    company: { id: "22222222-2222-4222-8222-222222222222", code: "482915", name: "Cantina", serviceFeeBps: 1000, modules },
  };
}

describe("menu do painel", () => {
  it("dono vê tudo", () => {
    expect(menuVisivel(perfil("owner"))).toHaveLength(MENU_PAINEL.length);
  });

  it("funcionário sem permissão vê só o início", () => {
    expect(menuVisivel(perfil("employee")).map((i) => i.id)).toEqual(["inicio"]);
  });

  it("funcionário vê só o que foi liberado", () => {
    const ids = menuVisivel(perfil("employee", ["orders.view", "tabs.view"])).map((i) => i.id);
    expect(ids).toEqual(["inicio", "mesas", "cozinha", "pedidos"]);
  });

  it("recurso fora do plano some do menu, mesmo para o dono", () => {
    const ids = menuVisivel(perfil("owner", [], { tabs: false, stock: false, storefront: true })).map((i) => i.id);
    expect(ids).not.toContain("mesas");
    expect(ids).not.toContain("estoque");
    expect(ids).toContain("balcao");
  });

  it("no celular os 4 primeiros viram abas e o resto vai para Mais", () => {
    const { abas, mais } = dividirParaCelular(menuVisivel(perfil("owner")));
    expect(abas.map((i) => i.id)).toEqual(["inicio", "mesas", "balcao", "cozinha"]);
    expect(mais).toHaveLength(MENU_PAINEL.length - 4);
  });
});
