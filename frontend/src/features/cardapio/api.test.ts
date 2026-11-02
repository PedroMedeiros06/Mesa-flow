import { describe, expect, it } from "vitest";
import { mover } from "./api";

describe("mover", () => {
  it("troca com o vizinho", () => {
    expect(mover(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(mover(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("não sai da lista", () => {
    expect(mover(["a", "b"], 0, -1)).toBeNull();
    expect(mover(["a", "b"], 1, 1)).toBeNull();
  });
});
