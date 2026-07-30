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
import { loadDailyReport } from "./daily-report-service";

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
      for (const method of ["select", "eq", "gte", "lt", "order"]) {
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
