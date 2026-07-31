/**
 * Phase 4 — reading one Manila day of the ledger on the phone.
 *
 * Mirrors `lib/inventory-service.ts`: inventory lives in the PLATFORM Supabase
 * for every tenant regardless of where their orders live, so this is a plain
 * Supabase read carrying the merchant's own session, not a Convex query and not
 * a service role.
 *
 * The shaping is the ported pure core, so these tests are about the fetch: the
 * window it asks for, the tenant gate, and what it does when a query fails.
 */
// The real client pulls in expo-constants, which this jest setup cannot
// transform. Every test injects its own db, so the module only needs to load.
jest.mock("./supabase", () => ({ supabase: { from: jest.fn() } }));

import { loadDailyReport, countDishesWithRecipe } from "./daily-report-service";

type Result = { data: unknown; error: unknown };

/**
 * A Supabase stub. The CLIENT is not thenable — only the builder `from()`
 * returns is awaitable, matching the real client.
 */
function fakeSupabase(byTable: Record<string, Result>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  return {
    calls,
    from(table: string) {
      const builder: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) =>
          resolve(byTable[table] ?? { data: [], error: null }),
      };
      // `maybeSingle` resolves rather than chaining — it is where a single-row
      // read ends, and the count session is read that way.
      builder.maybeSingle = (...args: unknown[]) => {
        calls.push({ table, method: "maybeSingle", args });
        const result = byTable[table] ?? { data: null, error: null };
        const rows = result.data as unknown[] | null;
        return Promise.resolve({
          data: Array.isArray(rows) ? rows[0] ?? null : rows,
          error: result.error,
        });
      };
      for (const method of ["select", "eq", "gte", "lt", "order", "limit"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      return builder;
    },
  };
}

const MOVEMENTS = {
  data: [
    {
      inventory_item_id: "i1",
      reason: "sale",
      quantity_delta: -5,
      balance_after: 95,
      created_at: "2026-07-29T02:00:00.000Z",
    },
  ],
  error: null,
};

const ITEMS = {
  data: [{ id: "i1", name: "Beans", unit_cost: 2, stock_unit_id: "u1" }],
  error: null,
};

const UNITS = { data: [{ id: "u1", abbreviation: "g" }], error: null };

function client(overrides: Partial<Record<string, Result>> = {}) {
  return fakeSupabase({
    stock_movements: MOVEMENTS,
    inventory_items: ITEMS,
    inventory_units: UNITS,
    ...overrides,
  } as Record<string, Result>);
}

function argsFor(db: ReturnType<typeof fakeSupabase>, table: string, method: string): unknown[] {
  return db.calls.find((call) => call.table === table && call.method === method)?.args ?? [];
}

describe("loadDailyReport", () => {
  test("reconciles the day through the shared pure core", async () => {
    // Arrange / Act
    const report = await loadDailyReport("t1", "2026-07-29", client() as never);

    // Assert
    expect(report?.rows).toHaveLength(1);
    expect(report?.totals.cogs).toBe(10);
    expect(report?.dayKey).toBe("2026-07-29");
  });

  test("asks for the half-open Manila window", async () => {
    // The same boundary the web report and the order numbers use. A UTC day
    // would put half a dinner service on the wrong report.
    const db = client();

    await loadDailyReport("t1", "2026-07-29", db as never);

    expect(argsFor(db, "stock_movements", "gte")).toEqual([
      "created_at",
      "2026-07-28T16:00:00.000Z",
    ]);
    expect(argsFor(db, "stock_movements", "lt")).toEqual(["created_at", "2026-07-29T16:00:00.000Z"]);
  });

  test("scopes every read to the tenant", async () => {
    const db = client();

    await loadDailyReport("t1", "2026-07-29", db as never);

    for (const table of ["stock_movements", "inventory_items", "inventory_units"]) {
      expect(argsFor(db, table, "eq")).toEqual(["tenant_id", "t1"]);
    }
  });

  test("returns null without querying when there is no tenant yet", async () => {
    // The auth store starts empty; a cold mount must not query for every tenant.
    const db = client();

    const report = await loadDailyReport("", "2026-07-29", db as never);

    expect(report).toBeNull();
    expect(db.calls).toHaveLength(0);
  });

  test("returns null when the ledger cannot be read", async () => {
    // A phone on a bad connection gets no report — never an empty one, which
    // would read as a day where nothing moved.
    const db = client({ stock_movements: { data: null, error: { message: "offline" } } });

    expect(await loadDailyReport("t1", "2026-07-29", db as never)).toBeNull();
  });

  test("returns null when the ingredients cannot be read", async () => {
    const db = client({ inventory_items: { data: null, error: { message: "offline" } } });

    expect(await loadDailyReport("t1", "2026-07-29", db as never)).toBeNull();
  });

  test("survives an unreadable unit catalog, losing only the suffix", async () => {
    // Same degradation as loadInventoryStock: a missing unit costs the "g", not
    // the day's figures.
    const db = client({ inventory_units: { data: null, error: { message: "offline" } } });

    const report = await loadDailyReport("t1", "2026-07-29", db as never);

    expect(report?.totals.cogs).toBe(10);
    expect(report?.rows[0]?.stockUnitAbbreviation).toBe("");
  });

  test("returns null rather than throwing on a nonsense day", async () => {
    // The day can come from a stale deep link; a read must not crash the screen.
    expect(await loadDailyReport("t1", "not-a-day", client() as never)).toBeNull();
  });
});

/**
 * The verdict refuses to grade a day when no dish has a recipe — without that
 * refusal, a tenant whose orders deduct nothing gets zero usage, zero
 * shrinkage, and a flawless grade forever. That refusal needs this count.
 *
 * `undefined` and `0` are emphatically different answers here: `0` is the
 * finding "no dish has a recipe", which the verdict states out loud, and
 * `undefined` is "could not tell", which withholds the verdict entirely.
 */
describe("countDishesWithRecipe", () => {
  const RECIPES = {
    data: [
      { id: "r1", target_type: "menu_item", menu_item_id: "m1" },
      { id: "r2", target_type: "menu_item", menu_item_id: "m2" },
    ],
    error: null,
  };
  const COMPONENTS = { data: [{ recipe_id: "r1" }], error: null };

  function recipeClient(overrides: Partial<Record<string, Result>> = {}) {
    return fakeSupabase({
      recipes: RECIPES,
      recipe_components: COMPONENTS,
      ...overrides,
    } as Record<string, Result>);
  }

  test("counts only dishes whose recipe actually lists an ingredient", async () => {
    // r2 is an empty recipe: it deducts nothing, so the dish is not covered.
    // This mirrors `hasRecipe: ingredientCount > 0` in the web's
    // recipe-coverage.ts — an empty recipe is a recipe nobody finished.
    expect(await countDishesWithRecipe("t1", recipeClient() as never)).toBe(1);
  });

  test("counts a dish once even when its recipe lists many ingredients", async () => {
    const db = recipeClient({
      recipe_components: {
        data: [{ recipe_id: "r1" }, { recipe_id: "r1" }, { recipe_id: "r1" }],
        error: null,
      },
    });

    expect(await countDishesWithRecipe("t1", db as never)).toBe(1);
  });

  test("ignores recipes attached to something other than a dish", async () => {
    // Variation and modifier options carry recipes too; the verdict asks how
    // many DISHES take stock off the shelf.
    const db = recipeClient({
      recipes: {
        data: [{ id: "r1", target_type: "variation_option", menu_item_id: null }],
        error: null,
      },
    });

    expect(await countDishesWithRecipe("t1", db as never)).toBe(0);
  });

  test("reports zero when the tenant has written no recipes at all", async () => {
    // Zero is a finding, not a failure — it is exactly what makes the verdict
    // say "no dish has a recipe yet" instead of grading the day perfect.
    const db = recipeClient({
      recipes: { data: [], error: null },
      recipe_components: { data: [], error: null },
    });

    expect(await countDishesWithRecipe("t1", db as never)).toBe(0);
  });

  test("returns undefined when the recipes cannot be read", async () => {
    // Not zero: a failed read must not masquerade as the finding "no dish has
    // a recipe", which would make the verdict state something untrue.
    const db = recipeClient({ recipes: { data: null, error: { message: "offline" } } });

    expect(await countDishesWithRecipe("t1", db as never)).toBeUndefined();
  });

  test("returns undefined when the components cannot be read", async () => {
    const db = recipeClient({
      recipe_components: { data: null, error: { message: "offline" } },
    });

    expect(await countDishesWithRecipe("t1", db as never)).toBeUndefined();
  });

  test("returns undefined without querying when there is no tenant yet", async () => {
    const db = recipeClient();

    expect(await countDishesWithRecipe("", db as never)).toBeUndefined();
    expect(db.calls).toHaveLength(0);
  });

  test("scopes both reads to the tenant", async () => {
    const db = recipeClient();

    await countDishesWithRecipe("t1", db as never);

    for (const table of ["recipes", "recipe_components"]) {
      expect(argsFor(db, table, "eq")).toEqual(["tenant_id", "t1"]);
    }
  });
});


/**
 * The half of the report that says how much of it to believe.
 *
 * The phone and the web must reach the SAME verdict about a day. A count that
 * stopped early is named on one surface and silent on the other is worse than
 * neither naming it — the merchant then has two accounts of one shelf and no
 * way to choose between them.
 */
describe("loadDailyReport — the day's count session", () => {
  const PARTIAL_COUNT = {
    data: [
      {
        id: "count-1",
        expected_item_count: 4,
        closed_at: "2026-07-29T14:00:00.000Z",
      },
    ],
    error: null,
  };

  const COUNTED_MOVEMENT = {
    data: [
      {
        inventory_item_id: "i1",
        reason: "stocktake",
        quantity_delta: -5,
        balance_after: 95,
        created_at: "2026-07-29T02:00:00.000Z",
        inventory_count_id: "count-1",
      },
    ],
    error: null,
  };

  test("reports how far the count actually got", async () => {
    const db = client({ inventory_counts: PARTIAL_COUNT, stock_movements: COUNTED_MOVEMENT });

    const report = await loadDailyReport("t1", "2026-07-29", db as never);

    expect(report?.countSession?.state).toBe("partial");
    expect(report?.countSession?.countedCount).toBe(1);
    expect(report?.countSession?.expectedCount).toBe(4);
  });

  test("says nothing about a day nobody counted", async () => {
    // Every day before sessions existed. Inventing an abandoned count from an
    // absent session would accuse a merchant of a count they never started.
    const db = client({ inventory_counts: { data: [], error: null } });

    const report = await loadDailyReport("t1", "2026-07-29", db as never);

    expect(report?.countSession).toBeNull();
  });

  test("scopes the session read to the tenant and the day", async () => {
    const db = client({ inventory_counts: PARTIAL_COUNT });

    await loadDailyReport("t1", "2026-07-29", db as never);

    const filters = db.calls.filter(
      (call) => call.table === "inventory_counts" && call.method === "eq",
    );
    expect(filters).toContainEqual(
      expect.objectContaining({ args: ["tenant_id", "t1"] }),
    );
    expect(filters).toContainEqual(
      expect.objectContaining({ args: ["business_day", "2026-07-29"] }),
    );
  });

  test("keeps the day's figures when the session read fails", async () => {
    // The stock figures are independently true. Losing the whole report because
    // its caveat could not be computed is the worse trade.
    const db = client({
      inventory_counts: { data: null, error: { message: "nope" } },
    });

    const report = await loadDailyReport("t1", "2026-07-29", db as never);

    expect(report?.totals.cogs).toBeCloseTo(10, 8);
    expect(report?.countSession).toBeNull();
  });
});
