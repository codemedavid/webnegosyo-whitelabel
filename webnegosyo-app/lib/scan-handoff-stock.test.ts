import { judgeHandoffStock } from "./scan-handoff-stock";
import type { PosStockCeilings } from "./pos-stock-warning";

const ceilings = (dishes: [string, number][], stockPolicy?: "warn" | "block"): PosStockCeilings => ({
  dishes: new Map(dishes),
  options: new Map(),
  stockPolicy,
});
const line = { menuItemId: "ribs", menuItemName: "Ribs", quantity: 1 };

describe("judgeHandoffStock", () => {
  it("has no opinion without ceilings or when stock covers the cart", () => {
    expect(judgeHandoffStock([line], ceilings([]), false)).toEqual({ kind: "ok" });
    expect(judgeHandoffStock([line], ceilings([["ribs", 1]], "block"), false)).toEqual({ kind: "ok" });
  });

  it("warns on a warn store", () => {
    expect(judgeHandoffStock([line], ceilings([["ribs", 0]], "warn"), false).kind).toBe("warn");
  });

  it("blocks a cashier on a block store", () => {
    const verdict = judgeHandoffStock([line], ceilings([["ribs", 0]], "block"), false);
    expect(verdict.kind).toBe("block");
    expect(verdict).toEqual(expect.objectContaining({ message: expect.stringContaining("Ribs") }));
  });

  it("still warns an owner or manager on a block store", () => {
    expect(judgeHandoffStock([line], ceilings([["ribs", 0]], "block"), true).kind).toBe("warn");
  });

  it("adds up lines of one dish", () => {
    const lines = [line, { ...line, quantity: 2 }];
    expect(judgeHandoffStock(lines, ceilings([["ribs", 2]], "block"), false).kind).toBe("block");
  });

  it("treats a negative ceiling as empty", () => {
    expect(judgeHandoffStock([line], ceilings([["ribs", -3]]), false).kind).toBe("warn");
  });
});
