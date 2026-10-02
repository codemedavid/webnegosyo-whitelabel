/**
 * Ingredient writes and the per-ingredient ledger read, on the merchant's own
 * session (RLS: admins manage their own tenant's inventory rows).
 */

jest.mock("./supabase", () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from "./supabase";
import {
  createIngredient,
  loadIngredientMovements,
  loadIngredientRecord,
  loadUnitOptions,
  setIngredientActive,
  updateIngredient,
} from "./ingredient-service";
import { DEFAULT_UNITS, type IngredientPayload } from "./ingredient-form";

type Result = { data: unknown; error: unknown };

/**
 * A chainable query whose every method returns itself and which resolves to
 * `result` when awaited — at any point in the chain, like PostgREST's builder.
 */
function chain(result: Result) {
  const calls: [string, unknown[]][] = [];
  const target: Record<string, unknown> = {};
  const proxy: Record<string, unknown> = new Proxy(target, {
    get(_, prop: string) {
      if (prop === "then") {
        return (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve);
      }
      if (prop === "calls") return calls;
      return (...args: unknown[]) => {
        calls.push([prop, args]);
        return proxy;
      };
    },
  });
  return proxy as Record<string, unknown> & { calls: [string, unknown[]][] };
}

const from = supabase.from as jest.Mock;

const PAYLOAD: IngredientPayload = {
  name: "Flour",
  sku: null,
  category: "Dry goods",
  stock_unit_id: "kg",
  unit_cost: 50,
  reorder_level: 5,
  is_prep: false,
  is_active: true,
};

beforeEach(() => jest.clearAllMocks());

describe("loadUnitOptions", () => {
  it("returns the active units", async () => {
    from.mockReturnValue(
      chain({
        data: [
          { id: "kg", name: "Kilogram", abbreviation: "kg", dimension: "weight", to_base_factor: 1000, is_active: true },
          { id: "x", name: "Old", abbreviation: "old", dimension: "count", to_base_factor: 1, is_active: false },
        ],
        error: null,
      }),
    );

    const units = await loadUnitOptions("t1");
    expect(units).toEqual([
      { id: "kg", name: "Kilogram", abbreviation: "kg", dimension: "weight", toBaseFactor: 1000 },
    ]);
  });

  it("seeds the starter catalog for a store that has no units yet, then re-reads", async () => {
    const empty = chain({ data: [], error: null });
    const insert = chain({ data: null, error: null });
    const seeded = chain({
      data: [{ id: "g", name: "Gram", abbreviation: "g", dimension: "weight", to_base_factor: 1, is_active: true }],
      error: null,
    });
    from.mockReturnValueOnce(empty).mockReturnValueOnce(insert).mockReturnValueOnce(seeded);

    const units = await loadUnitOptions("t1");

    const inserted = insert.calls.find(([method]) => method === "insert")?.[1][0] as unknown[];
    expect(inserted).toHaveLength(DEFAULT_UNITS.length);
    expect(units.map((u) => u.id)).toEqual(["g"]);
  });

  it("says so when seeding fails and the store still has no units", async () => {
    // Otherwise the editor opens with an empty unit picker and no way forward.
    from
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: null, error: { message: "rls" } }))
      .mockReturnValueOnce(chain({ data: [], error: null }));

    await expect(loadUnitOptions("t1")).rejects.toThrow("units");
  });

  it("reads nothing without a tenant", async () => {
    expect(await loadUnitOptions("")).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("createIngredient", () => {
  it("stamps the tenant and returns the new id", async () => {
    const query = chain({ data: { id: "new-1" }, error: null });
    from.mockReturnValue(query);

    await expect(createIngredient("t1", PAYLOAD)).resolves.toBe("new-1");
    const inserted = query.calls.find(([m]) => m === "insert")?.[1][0];
    expect(inserted).toEqual({ tenant_id: "t1", ...PAYLOAD });
  });

  it("throws a readable sentence when the insert fails", async () => {
    from.mockReturnValue(chain({ data: null, error: { message: "rls" } }));
    await expect(createIngredient("t1", PAYLOAD)).rejects.toThrow("The ingredient was not saved");
  });
});

describe("updateIngredient", () => {
  it("scopes the update to the tenant and the row", async () => {
    const query = chain({ data: [{ id: "i1" }], error: null });
    from.mockReturnValue(query);

    await updateIngredient("t1", "i1", PAYLOAD);
    const eqs = query.calls.filter(([m]) => m === "eq").map(([, args]) => args);
    expect(eqs).toEqual([
      ["tenant_id", "t1"],
      ["id", "i1"],
    ]);
  });

  it("treats a zero-row update as a failure, never a silent success", async () => {
    // PostgREST answers an RLS-refused update with 200 and no rows.
    from.mockReturnValue(chain({ data: [], error: null }));
    await expect(updateIngredient("t1", "i1", PAYLOAD)).rejects.toThrow("could not be changed");
  });
});

describe("setIngredientActive", () => {
  it("writes only the active flag", async () => {
    const query = chain({ data: [{ id: "i1" }], error: null });
    from.mockReturnValue(query);

    await setIngredientActive("t1", "i1", false);
    const update = query.calls.find(([m]) => m === "update")?.[1][0] as Record<string, unknown>;
    expect(update.is_active).toBe(false);
    expect(update).not.toHaveProperty("name");
  });
});

describe("loadIngredientRecord", () => {
  it("returns null for an ingredient that no longer exists", async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    await expect(loadIngredientRecord("t1", "gone")).resolves.toBeNull();
  });

  it("coerces numeric columns", async () => {
    from.mockReturnValue(
      chain({
        data: {
          id: "i1", name: "Flour", sku: null, category: null, stock_unit_id: "kg",
          unit_cost: "52.5", reorder_level: "5", is_prep: false, is_active: true, current_qty: "12",
        },
        error: null,
      }),
    );
    const record = await loadIngredientRecord("t1", "i1");
    expect(record).toMatchObject({ unit_cost: 52.5, reorder_level: 5, current_qty: 12 });
  });
});

describe("loadIngredientMovements", () => {
  it("reads every branch when the whole store is on screen", async () => {
    const query = chain({ data: [], error: null });
    from.mockReturnValue(query);
    await loadIngredientMovements("t1", "i1", undefined);
    expect(query.calls.some(([m, args]) => m === "eq" && args[0] === "outlet_id")).toBe(false);
    expect(query.calls.some(([m]) => m === "is")).toBe(false);
  });

  it("uses IS NULL for the store pool, since = NULL matches nothing", async () => {
    const query = chain({ data: [], error: null });
    from.mockReturnValue(query);
    await loadIngredientMovements("t1", "i1", null);
    expect(query.calls).toContainEqual(["is", ["outlet_id", null]]);
  });

  it("narrows to one branch", async () => {
    const query = chain({ data: [], error: null });
    from.mockReturnValue(query);
    await loadIngredientMovements("t1", "i1", "north");
    expect(query.calls).toContainEqual(["eq", ["outlet_id", "north"]]);
  });

  it("orders newest first and bounds the read", async () => {
    const query = chain({ data: [], error: null });
    from.mockReturnValue(query);
    await loadIngredientMovements("t1", "i1");
    expect(query.calls).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(query.calls.some(([m]) => m === "limit")).toBe(true);
  });

  it("surfaces a failed read", async () => {
    from.mockReturnValue(chain({ data: null, error: { message: "boom" } }));
    await expect(loadIngredientMovements("t1", "i1")).rejects.toThrow("stock history");
  });
});
