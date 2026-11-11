/**
 * Running a stock count from the phone.
 *
 * The phone is where a count actually happens — the merchant is standing at the
 * shelf with the sack in their hands. Until now it could only ever see that a
 * count was running; starting and finishing one meant walking to a laptop,
 * which is exactly the moment a count gets abandoned.
 *
 * Unlike a movement, this writes straight to Supabase rather than through the
 * platform. A movement needs the server: the signed delta is resolved against
 * the on-hand quantity in the same request, a delivery blends into the moving
 * average, and crossing the reorder line raises alerts. A count SESSION does
 * none of that — it records the act, not its effect — and `inventory_counts`
 * RLS (migration 20260812120000) already confines a writer to the branches they
 * may reach. A route would add a hop and no boundary.
 */

// The default client is never used — every test injects its own db — but the
// module still imports it, and the real one reaches expo-constants.
jest.mock("./supabase", () => ({ supabase: { from: jest.fn() } }));

import { toBusinessDayKey } from "./daily-report/business-day";
import {
  loadOpenCount,
  openCount,
  closeCount,
} from "./count-session-service";

/** Every filter the service applied, so the scoping can be asserted directly. */
interface Recorded {
  filters: { table: string; column: string; value: unknown }[];
  isFilters: { table: string; column: string }[];
  inserts: { table: string; row: Record<string, unknown> }[];
  updates: { table: string; row: Record<string, unknown> }[];
}

/**
 * A chainable Supabase stub.
 *
 * `results` is keyed by table. A plain value is returned for every call; an
 * ARRAY is a queue, one entry per call in order, which is what lets a test say
 * "no count is running, then this is the one that was inserted" — the two reads
 * hit the same table and must answer differently.
 *
 * Deliberately hand-rolled rather than shared with inventory-service.test.ts:
 * this one records the FILTERS, and a scoping assertion that cannot see them
 * proves nothing.
 */
function makeDb(results: Record<string, unknown>, paged: Record<string, unknown[]> = {}) {
  const recorded: Recorded = { filters: [], isFilters: [], inserts: [], updates: [] };
  const queues: Record<string, unknown[]> = {};
  for (const [table, value] of Object.entries(results)) {
    if (Array.isArray(value)) queues[table] = [...value];
  }

  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const settle = () => {
      const queue = queues[table];
      if (queue) return Promise.resolve(queue.shift() ?? { data: null, error: null });
      return Promise.resolve(results[table] ?? { data: null, error: null });
    };

    // A table in `paged` answers like the platform database: `.range()` is
    // honoured and one response never carries more than 1,000 rows.
    let window = { from: 0, to: Number.POSITIVE_INFINITY };
    const settleList = () => {
      const rows = paged[table];
      if (!rows) return settle();
      const end = Math.min(window.to + 1, window.from + 1000);
      return Promise.resolve({ data: rows.slice(window.from, end), error: null });
    };

    chain.select = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.range = (from: number, to: number) => {
      window = { from, to };
      return chain;
    };
    chain.eq = (column: string, value: unknown) => {
      recorded.filters.push({ table, column, value });
      return chain;
    };
    chain.is = (column: string) => {
      recorded.isFilters.push({ table, column });
      return chain;
    };
    chain.insert = (row: Record<string, unknown>) => {
      recorded.inserts.push({ table, row });
      return chain;
    };
    chain.update = (row: Record<string, unknown>) => {
      recorded.updates.push({ table, row });
      return chain;
    };
    chain.single = settle;
    chain.maybeSingle = settle;
    chain.then = (resolve: (value: unknown) => unknown) => settleList().then(resolve);

    return chain;
  };

  return { db: { from } as never, recorded };
}

const OPEN_COUNT = {
  id: "c1",
  outlet_id: null,
  business_day: "2026-07-31",
  expected_item_count: 12,
  closed_at: null,
};

describe("loadOpenCount", () => {
  it("reports how far the running count has got", async () => {
    const { db } = makeDb({
      inventory_counts: { data: OPEN_COUNT, error: null },
      stock_movements: {
        // One sack counted twice is still one sack — the service must not
        // credit coverage per movement.
        data: [{ inventory_item_id: "i1" }, { inventory_item_id: "i1" }, { inventory_item_id: "i2" }],
        error: null,
      },
    });

    const session = await loadOpenCount("t1", null, db);

    expect(session?.id).toBe("c1");
    expect(session?.progress.countedCount).toBe(2);
    expect(session?.progress.expectedCount).toBe(12);
    expect(session?.progress.state).toBe("open");
  });

  it("returns null when nobody has opened a count", async () => {
    const { db } = makeDb({ inventory_counts: { data: null, error: null } });

    expect(await loadOpenCount("t1", null, db)).toBeNull();
  });

  it("asks for the store pool with an IS NULL, not an equality", async () => {
    // `outlet_id = NULL` matches nothing in SQL. The store pool is a real shelf
    // rather than an absent one, so asking the wrong question would hide every
    // unbranched tenant's count and offer to start a second.
    const { db, recorded } = makeDb({ inventory_counts: { data: null, error: null } });

    await loadOpenCount("t1", null, db);

    expect(recorded.isFilters).toContainEqual({
      table: "inventory_counts",
      column: "outlet_id",
    });
  });

  it("scopes a branch manager's count to their own branch", async () => {
    const { db, recorded } = makeDb({ inventory_counts: { data: null, error: null } });

    await loadOpenCount("t1", "north", db);

    expect(recorded.filters).toContainEqual({
      table: "inventory_counts",
      column: "outlet_id",
      value: "north",
    });
  });

  it("yields null rather than a phantom count when the read fails", async () => {
    // A thrown error here would cost the merchant the whole inventory screen
    // over a caveat. Null is safe because `openCount` JOINS a running count
    // rather than opening a second one.
    const { db } = makeDb({
      inventory_counts: { data: null, error: { message: "network" } },
    });

    expect(await loadOpenCount("t1", null, db)).toBeNull();
  });
});

describe("openCount", () => {
  it("snapshots how many ingredients were in scope when it opened", async () => {
    const { db, recorded } = makeDb({
      // Nothing running, then the row the insert returned.
      inventory_counts: [
        { data: null, error: null },
        { data: { ...OPEN_COUNT, expected_item_count: 3 }, error: null },
      ],
      inventory_items: { data: [{ id: "i1" }, { id: "i2" }, { id: "i3" }], error: null },
      stock_movements: { data: [], error: null },
    });

    await openCount("t1", { outletId: null, startedBy: "u1" }, db);

    const insert = recorded.inserts.find((entry) => entry.table === "inventory_counts");
    expect(insert?.row.expected_item_count).toBe(3);
  });

  it("leaves a retired ingredient out of the denominator", async () => {
    // A count cannot reach an ingredient the store no longer stocks, so
    // counting it in scope would cap coverage below 100 forever and teach the
    // merchant that a complete count is unachievable.
    const { db, recorded } = makeDb({
      inventory_counts: [{ data: null, error: null }, { data: OPEN_COUNT, error: null }],
      inventory_items: { data: [], error: null },
      stock_movements: { data: [], error: null },
    });

    await openCount("t1", { outletId: null, startedBy: "u1" }, db);

    expect(recorded.filters).toContainEqual({
      table: "inventory_items",
      column: "is_active",
      value: true,
    });
  });

  it("joins the count already running instead of opening a second", async () => {
    // Two open sessions mean two people counting the same sack into different
    // documents, and each would then report partial coverage of a shelf that
    // was in fact counted twice over.
    const { db, recorded } = makeDb({
      inventory_counts: { data: { ...OPEN_COUNT, business_day: toBusinessDayKey(new Date().toISOString()) }, error: null },
      stock_movements: { data: [], error: null },
    });

    const session = await openCount("t1", { outletId: null, startedBy: "u1" }, db);

    expect(session.id).toBe("c1");
    expect(recorded.inserts).toHaveLength(0);
  });

  it("closes a count left open from an earlier day and starts today's", async () => {
    const { db, recorded } = makeDb({
      // The stale open count, then the row the insert returned.
      inventory_counts: [
        { data: OPEN_COUNT, error: null },
        { data: [{ id: "c1" }], error: null },
        { data: { ...OPEN_COUNT, id: "c2" }, error: null },
      ],
      inventory_items: { data: [], error: null },
      stock_movements: { data: [], error: null },
    });

    const session = await openCount("t1", { outletId: null, startedBy: "u1" }, db);

    expect(recorded.updates[0]?.row.status).toBe("closed");
    expect(recorded.inserts).toHaveLength(1);
    expect(session.id).toBe("c2");
  });

  it("records who started it", async () => {
    const { db, recorded } = makeDb({
      inventory_counts: [{ data: null, error: null }, { data: OPEN_COUNT, error: null }],
      inventory_items: { data: [], error: null },
      stock_movements: { data: [], error: null },
    });

    await openCount("t1", { outletId: null, startedBy: "u9" }, db);

    const insert = recorded.inserts.find((entry) => entry.table === "inventory_counts");
    expect(insert?.row.started_by).toBe("u9");
  });

  it("surfaces a failed open instead of reporting a count that is not running", async () => {
    // The merchant is watching this one. A silent failure would have them
    // counting a shelf into a session that does not exist.
    const { db } = makeDb({
      inventory_counts: { data: null, error: { message: "denied" } },
      inventory_items: { data: [], error: null },
    });

    await expect(openCount("t1", { outletId: null, startedBy: "u1" }, db)).rejects.toThrow();
  });
});

describe("closeCount", () => {
  it("stamps the count closed and when", async () => {
    const { db, recorded } = makeDb({
      inventory_counts: { data: { ...OPEN_COUNT, closed_at: "2026-07-31T10:00:00Z" }, error: null },
    });

    await closeCount("t1", "c1", "u1", db);

    const update = recorded.updates.find((entry) => entry.table === "inventory_counts");
    expect(update?.row.status).toBe("closed");
    expect(update?.row.closed_at).toEqual(expect.any(String));
    expect(update?.row.closed_by).toBe("u1");
  });

  it("scopes the close to the caller's own store", async () => {
    // The id alone is a guess away from closing a stranger's count. RLS would
    // refuse it, but a query that relies on RLS to be correct reads as though
    // it did not need to be.
    const { db, recorded } = makeDb({
      inventory_counts: { data: OPEN_COUNT, error: null },
    });

    await closeCount("t1", "c1", "u1", db);

    expect(recorded.filters).toContainEqual({
      table: "inventory_counts",
      column: "tenant_id",
      value: "t1",
    });
  });

  it("surfaces a failed close rather than showing the count as finished", async () => {
    const { db } = makeDb({
      inventory_counts: { data: null, error: { message: "denied" } },
    });

    await expect(closeCount("t1", "c1", "u1", db)).rejects.toThrow();
  });

  it("reports a close the database refused, instead of showing the count as finished", async () => {
    // Row-level security refuses silently: no error, zero rows. The count is
    // still open when read back.
    const { db } = makeDb({
      inventory_counts: [
        { data: [], error: null },
        { data: OPEN_COUNT, error: null },
      ],
    });

    await expect(closeCount("t1", "c1", "u1", db)).rejects.toThrow(
      "The stock count could not be closed. You may not have access to do this.",
    );
  });

  it("reports a count it can no longer see as not closed", async () => {
    const { db } = makeDb({
      inventory_counts: [
        { data: [], error: null },
        { data: null, error: null },
      ],
    });

    await expect(closeCount("t1", "c1", "u1", db)).rejects.toThrow(/could not be closed/);
  });

  it("is fine when someone else closed it first: the same count, already over", async () => {
    const { db } = makeDb({
      inventory_counts: [
        { data: [], error: null },
        { data: { ...OPEN_COUNT, closed_at: "2026-07-31T10:00:00Z" }, error: null },
      ],
    });

    await expect(closeCount("t1", "c1", "u1", db)).resolves.toBeUndefined();
  });
});

describe("a store with more than 1,000 ingredients", () => {
  // One response from the platform database stops at 1,000 rows and says
  // nothing about the rest, so both sides of a count's coverage stopped there.
  const ids = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `i${index}` }));
  const lines = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ inventory_item_id: `i${index}` }));

  it("opens a count expecting every active ingredient, not the first 1,000", async () => {
    const { db, recorded } = makeDb(
      {
        inventory_counts: [{ data: null, error: null }, { data: OPEN_COUNT, error: null }],
      },
      { inventory_items: ids(1200), stock_movements: [] },
    );

    await openCount("t1", { outletId: null, startedBy: "u1" }, db);

    const insert = recorded.inserts.find((entry) => entry.table === "inventory_counts");
    expect(insert?.row.expected_item_count).toBe(1200);
  });

  it("reports every ingredient a count reached, so a full count is not shown as partial", async () => {
    const { db } = makeDb(
      { inventory_counts: { data: { ...OPEN_COUNT, expected_item_count: 1200 }, error: null } },
      { stock_movements: lines(1200) },
    );

    const session = await loadOpenCount("t1", null, db);

    expect(session?.progress.countedCount).toBe(1200);
    expect(session?.progress.coveragePercent).toBe(100);
  });

  it("refuses to open a count with a wrong denominator when there are too many ingredients to read", async () => {
    const { db, recorded } = makeDb(
      { inventory_counts: [{ data: null, error: null }] },
      { inventory_items: ids(10_001), stock_movements: [] },
    );

    await expect(openCount("t1", { outletId: null, startedBy: "u1" }, db)).rejects.toThrow(
      /more than 10,000/,
    );
    expect(recorded.inserts).toHaveLength(0);
  });
});
