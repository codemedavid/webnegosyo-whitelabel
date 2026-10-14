/**
 * The phone's order activity read must page past PostgREST's 1000-row cap.
 *
 * A single `.limit(2000)` is silently answered with at most 1000 rows, so a
 * busy store's Team screen and shift card used to drop every act older than
 * the newest thousand without a word. The read now walks `range()` pages,
 * bounded, and stops on the first short page.
 */

// The default client is never used — every test injects its own db — but the
// module still imports it, and the real one reaches expo-constants.
jest.mock("../supabase", () => ({ supabase: { from: jest.fn() } }));

import { ACTIVITY_PAGE_SIZE, ACTIVITY_ROW_CEILING, listOrderActivity } from "./activity-service";

interface Call {
  ranges: [number, number][];
  orders: { column: string; ascending: boolean }[];
  limits: number[];
}

function row(index: number) {
  return {
    id: `e${index}`,
    external_order_id: `o${index}`,
    event: "status_changed",
    status: "confirmed",
    source: "pos",
    order_total: 100,
    actor_user_id: "u1",
    actor_name: "Ana",
    occurred_at: new Date(Date.UTC(2026, 9, 12) - index * 1000).toISOString(),
  };
}

/** A db holding `total` rows; each `range(from, to)` answers that slice, like PostgREST. */
function fakeDb(total: number, failOnPage?: number) {
  const call: Call = { ranges: [], orders: [], limits: [] };
  const all = Array.from({ length: total }, (_, index) => row(index));
  const db = {
    from: jest.fn(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        order: (column: string, options: { ascending: boolean }) => {
          call.orders.push({ column, ascending: options.ascending });
          return builder;
        },
        limit: (n: number) => {
          call.limits.push(n);
          return builder;
        },
        range: (from: number, to: number) => {
          call.ranges.push([from, to]);
          const page = call.ranges.length;
          if (page === failOnPage) return Promise.resolve({ data: null, error: { message: "boom" } });
          return Promise.resolve({ data: all.slice(from, to + 1), error: null });
        },
      };
      return builder;
    }),
  };
  return { db, call };
}

describe("listOrderActivity paging", () => {
  it("reads past the 1000-row API cap instead of stopping at the first page", async () => {
    // Arrange
    const { db, call } = fakeDb(1500);

    // Act
    const events = await listOrderActivity("t1", { sinceIso: "2026-10-01T00:00:00Z" }, db as never);

    // Assert
    expect(events).toHaveLength(1500);
    expect(call.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(call.limits).toEqual([]);
  });

  it("orders by a total ordering so rows cannot shift between pages", async () => {
    const { db, call } = fakeDb(10);

    await listOrderActivity("t1", { sinceIso: "2026-10-01T00:00:00Z" }, db as never);

    expect(call.orders).toEqual([
      { column: "occurred_at", ascending: false },
      { column: "id", ascending: false },
    ]);
  });

  it("stops at the ceiling, never reading unbounded", async () => {
    const { db, call } = fakeDb(10_000);

    const events = await listOrderActivity("t1", { sinceIso: "2026-10-01T00:00:00Z" }, db as never);

    expect(events).toHaveLength(ACTIVITY_ROW_CEILING);
    expect(call.ranges.length).toBe(Math.ceil(ACTIVITY_ROW_CEILING / ACTIVITY_PAGE_SIZE));
    expect(call.ranges.length).toBeLessThanOrEqual(5);
  });

  it("stops after one request when the first page is short", async () => {
    const { db, call } = fakeDb(3);

    const events = await listOrderActivity("t1", { sinceIso: "2026-10-01T00:00:00Z" }, db as never);

    expect(events.map((event) => event.id)).toEqual(["e0", "e1", "e2"]);
    expect(call.ranges).toEqual([[0, 999]]);
  });

  it("throws on a failed page rather than returning a silently short history", async () => {
    const { db } = fakeDb(2500, 2);

    await expect(
      listOrderActivity("t1", { sinceIso: "2026-10-01T00:00:00Z" }, db as never),
    ).rejects.toThrow(/could not be read.*boom/);
  });
});
