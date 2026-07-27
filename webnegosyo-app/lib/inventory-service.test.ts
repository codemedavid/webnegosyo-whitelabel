/**
 * Reading the shelf from the platform Supabase.
 *
 * Inventory lives in the platform database for every tenant, wherever their
 * orders live, so this is a plain Supabase read rather than a Convex query.
 * The app's client carries the merchant's own session, and `inventory_items`
 * RLS is scoped to their tenant — no service role is involved on this path,
 * unlike the server-side alert writer.
 */

import { loadInventoryStock } from "./inventory-service";

jest.mock("./supabase", () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from "./supabase";

/** A chainable Supabase query stub whose terminal call resolves `result`. */
function queryChain(terminal: string, result: unknown) {
  const chain: Record<string, jest.Mock> = {};
  ["select", "eq", "order"].forEach((method) => {
    chain[method] = jest.fn(() => chain);
  });
  chain[terminal] = jest.fn(() => Promise.resolve(result));
  return chain;
}

function mockTables(items: unknown, units: unknown) {
  (supabase.from as jest.Mock).mockImplementation((table: string) =>
    table === "inventory_items"
      ? queryChain("order", items)
      : queryChain("eq", units),
  );
}

const flourRow = {
  id: "i1",
  name: "Flour",
  current_qty: 5,
  reorder_level: 20,
  is_active: true,
  stock_unit_id: "u1",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("loadInventoryStock", () => {
  it("returns the shelf with units resolved and levels stamped", async () => {
    mockTables(
      { data: [flourRow], error: null },
      { data: [{ id: "u1", abbreviation: "kg" }], error: null },
    );

    const shelf = await loadInventoryStock("tenant-1");

    expect(shelf).toEqual([
      {
        id: "i1",
        name: "Flour",
        quantity: 5,
        reorderLevel: 20,
        // Carried through now that a movement needs a unit to be recorded in.
        stockUnitId: "u1",
        unitAbbreviation: "kg",
        level: "low",
      },
    ]);
  });

  it("scopes both reads to the requesting tenant", async () => {
    const items = queryChain("order", { data: [], error: null });
    const units = queryChain("eq", { data: [], error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "inventory_items" ? items : units,
    );

    await loadInventoryStock("tenant-1");

    expect(items.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(units.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("sorts the trouble to the top before handing the list over", async () => {
    // The screen re-filters but never re-sorts; order is decided here once.
    mockTables(
      {
        data: [
          { ...flourRow, id: "ok", name: "Sugar", current_qty: 99 },
          { ...flourRow, id: "out", name: "Yeast", current_qty: 0 },
          { ...flourRow, id: "low", name: "Butter", current_qty: 5 },
        ],
        error: null,
      },
      { data: [], error: null },
    );

    const shelf = await loadInventoryStock("tenant-1");

    expect(shelf.map((v) => v.id)).toEqual(["out", "low", "ok"]);
  });

  it("throws when the ingredient read fails, so the screen can offer a retry", async () => {
    mockTables({ data: null, error: new Error("db down") }, { data: [], error: null });

    await expect(loadInventoryStock("tenant-1")).rejects.toThrow("db down");
  });

  it("still lists ingredients when the unit catalog cannot be read", async () => {
    // A missing unit costs the suffix; it must not cost the merchant the shelf.
    mockTables({ data: [flourRow], error: null }, { data: null, error: new Error("nope") });

    const shelf = await loadInventoryStock("tenant-1");

    expect(shelf).toHaveLength(1);
    expect(shelf[0].unitAbbreviation).toBe("");
  });

  it("reads nothing at all without a tenant", async () => {
    // The auth store starts empty; a cold mount must not query for every tenant.
    const shelf = await loadInventoryStock("");

    expect(shelf).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
