/**
 * Prices reach the app only through the `costs`-gated reader.
 */
jest.mock("./supabase", () => ({ supabase: { rpc: jest.fn() } }));

import { loadItemCosts, withCosts } from "./inventory-costs";

const client = (rpc: jest.Mock) => ({ rpc }) as never;

describe("loadItemCosts", () => {
  it("returns the price of each ingredient the reader answers", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        { inventory_item_id: "a", unit_cost: "12.5" },
        { inventory_item_id: "b", unit_cost: 0 },
      ],
      error: null,
    });
    const costs = await loadItemCosts("t1", undefined, client(rpc));
    expect(costs.get("a")).toBe(12.5);
    expect(costs.get("b")).toBe(0);
    expect(rpc).toHaveBeenCalledWith("inventory_costs_for_tenant", { p_tenant_id: "t1", p_item_ids: null, p_after: null });
  });

  it("pages past the 1000-row cap by id", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ inventory_item_id: `id-${String(i).padStart(4, "0")}`, unit_cost: 1 }));
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({ data: page, error: null })
      .mockResolvedValueOnce({ data: [{ inventory_item_id: "id-9999", unit_cost: 2 }], error: null });
    const costs = await loadItemCosts("t1", undefined, client(rpc));
    expect(costs.size).toBe(1001);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_after: "id-0999" });
  });

  it("answers an empty map to an account without costs (42501), not an error and not zeros", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "needs costs" } });
    const costs = await loadItemCosts("t1", undefined, client(rpc));
    expect(costs.size).toBe(0);
  });

  it("throws on any other failure, so a network error never reads as free stock", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "08006", message: "connection lost" } });
    await expect(loadItemCosts("t1", undefined, client(rpc))).rejects.toMatchObject({ code: "08006" });
  });

  it("does not call the server without a tenant", async () => {
    const rpc = jest.fn();
    expect((await loadItemCosts("", undefined, client(rpc))).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("withCosts", () => {
  it("sets the price where known and leaves it absent elsewhere", () => {
    const rows = withCosts([{ id: "a" }, { id: "b" }], new Map([["a", 3]]));
    expect(rows[0]).toEqual({ id: "a", unit_cost: 3 });
    expect("unit_cost" in rows[1]).toBe(false);
  });
});
