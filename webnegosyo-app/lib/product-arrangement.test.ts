/**
 * Arranging products within a category from the merchant app.
 *
 * `menu_items.order` is what BOTH the storefront and this app's register sort
 * by, so one arrangement drives both. Live stores carry thousands of tied
 * positions, so every arrangement renumbers the whole category — and a write
 * that RLS silently refused (zero rows, no error) must not read as saved.
 */

const calls: { method: string; args: unknown[] }[] = [];
let queued: { data: unknown; error: unknown }[] = [];

function nextResult(): { data: unknown; error: unknown } {
  return queued.shift() ?? { data: [], error: null };
}

jest.mock("./supabase", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "update", "eq", "order", "limit", "maybeSingle"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) => resolve(nextResult());
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        calls.push({ method: "from", args: [table] });
        return makeChain();
      },
    },
  };
});

import {
  STALE_ARRANGEMENT_ERROR,
  moveId,
  nextProductOrder,
  planProductArrangement,
  readMovedProductOrder,
  reorderProducts,
} from "./product-arrangement";

function argsFor(method: string): unknown[][] {
  return calls.filter((c) => c.method === method).map((c) => c.args);
}

beforeEach(() => {
  calls.length = 0;
  queued = [];
});

describe("moveId", () => {
  it("swaps a product with its neighbour", () => {
    expect(moveId(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("leaves the ends where they are", () => {
    expect(moveId(["a", "b"], "a", "up")).toEqual(["a", "b"]);
    expect(moveId(["a", "b"], "b", "down")).toEqual(["a", "b"]);
  });

  it("does not mutate the caller's list", () => {
    const ids = ["a", "b"];
    moveId(ids, "b", "up");
    expect(ids).toEqual(["a", "b"]);
  });
});

describe("planProductArrangement", () => {
  it("writes only the products whose position changes, renumbering ties", () => {
    const current = [
      { id: "a", order: 0 },
      { id: "b", order: 0 },
      { id: "c", order: 0 },
    ];

    expect(planProductArrangement(current, ["a", "c", "b"])).toEqual({
      ok: true,
      writes: [
        { id: "c", order: 1 },
        { id: "b", order: 2 },
      ],
    });
  });

  it("refuses an arrangement that is not exactly the category's products", () => {
    const current = [
      { id: "a", order: 0 },
      { id: "b", order: 1 },
    ];

    expect(planProductArrangement(current, ["a"])).toEqual({ ok: false, error: STALE_ARRANGEMENT_ERROR });
    expect(planProductArrangement(current, ["a", "x"])).toEqual({ ok: false, error: STALE_ARRANGEMENT_ERROR });
    expect(planProductArrangement(current, ["a", "a"])).toEqual({ ok: false, error: STALE_ARRANGEMENT_ERROR });
  });
});

describe("reorderProducts", () => {
  it("re-reads the category, then writes each moved product scoped to tenant and category", async () => {
    queued = [
      { data: [{ id: "a", order: 0 }, { id: "b", order: 1 }], error: null },
      { data: [{ id: "b" }], error: null },
      { data: [{ id: "a" }], error: null },
    ];

    await reorderProducts("tenant-1", "cat-1", ["b", "a"]);

    expect(argsFor("update")).toEqual([[{ order: 0 }], [{ order: 1 }]]);
    expect(argsFor("eq")).toEqual(
      expect.arrayContaining([
        ["tenant_id", "tenant-1"],
        ["category_id", "cat-1"],
        ["id", "b"],
        ["id", "a"],
      ]),
    );
  });

  it("refuses a stale arrangement without writing", async () => {
    queued = [{ data: [{ id: "a", order: 0 }, { id: "b", order: 1 }], error: null }];

    await expect(reorderProducts("tenant-1", "cat-1", ["a"])).rejects.toThrow(STALE_ARRANGEMENT_ERROR);
    expect(argsFor("update")).toEqual([]);
  });

  it("surfaces a failed write", async () => {
    queued = [
      { data: [{ id: "a", order: 3 }], error: null },
      { data: null, error: new Error("write failed") },
    ];

    await expect(reorderProducts("tenant-1", "cat-1", ["a"])).rejects.toThrow("write failed");
  });

  it("treats a write that changed no row as a failure", async () => {
    queued = [
      { data: [{ id: "a", order: 3 }], error: null },
      { data: [], error: null },
    ];

    await expect(reorderProducts("tenant-1", "cat-1", ["a"])).rejects.toThrow(/could not save/i);
  });
});

describe("nextProductOrder", () => {
  it("places a new product after everything in its category", async () => {
    queued = [{ data: [{ order: 7 }], error: null }];

    await expect(nextProductOrder("tenant-1", "cat-1")).resolves.toBe(8);
    expect(argsFor("eq")).toEqual([
      ["tenant_id", "tenant-1"],
      ["category_id", "cat-1"],
    ]);
  });

  it("starts an empty category at 0", async () => {
    queued = [{ data: [], error: null }];

    await expect(nextProductOrder("tenant-1", "cat-1")).resolves.toBe(0);
  });
});

describe("readMovedProductOrder", () => {
  it("keeps an edited product's place while it stays in its category", async () => {
    queued = [{ data: { category_id: "cat-1" }, error: null }];

    await expect(readMovedProductOrder("tenant-1", "p1", "cat-1")).resolves.toBeUndefined();
    expect(argsFor("from")).toHaveLength(1);
  });

  it("sends a product moved to another category to the end of it", async () => {
    queued = [
      { data: { category_id: "cat-1" }, error: null },
      { data: [{ order: 4 }], error: null },
    ];

    await expect(readMovedProductOrder("tenant-1", "p1", "cat-2")).resolves.toBe(5);
  });

  it("surfaces a failed read", async () => {
    queued = [{ data: null, error: new Error("read failed") }];

    await expect(readMovedProductOrder("tenant-1", "p1", "cat-2")).rejects.toThrow("read failed");
  });
});
