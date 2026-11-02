import { describe, expect, it } from "vitest";
import { can, isPermission, PERMISSION_KEYS } from "./permissions.js";

describe("permissões", () => {
  it("todas as chaves seguem o formato area.acao", () => {
    for (const key of PERMISSION_KEYS) expect(key).toMatch(/^[a-z]+\.[a-z_]+$/);
  });

  it("rejeita o formato antigo em camelCase", () => {
    expect(isPermission("ordersCreate")).toBe(false);
    expect(isPermission("orders.create")).toBe(true);
    expect(isPermission("toString")).toBe(false);
  });

  it("dono pode tudo, funcionário só o concedido", () => {
    expect(can("owner", [], "orders.cancel")).toBe(true);
    expect(can("employee", ["orders.create"], "orders.create")).toBe(true);
    expect(can("employee", ["orders.create"], "orders.cancel")).toBe(false);
  });
});
