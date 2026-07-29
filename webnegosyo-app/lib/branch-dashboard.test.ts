import { filterQueueToScope, deriveStatsForScope } from "./branch-dashboard";

/**
 * The dashboard's two branch-scoping problems.
 *
 * 1. The live queue arrives grouped by status (`getRealtimeQueue` returns
 *    `Record<status, Order[]>`), so the flat `filterOrdersToScope` cannot be
 *    pointed at it. Emptying a bucket must not delete the key — the status
 *    pipeline renders a column per status and a missing key reads as a broken
 *    screen rather than as "no orders here".
 *
 * 2. `getDashboardStats` is aggregated inside Convex over the whole tenant, so
 *    a branch account would otherwise read its own order list beside a
 *    store-wide revenue figure. These stats are re-derived on the client from
 *    the order list so the two agree. The arithmetic must match the Convex
 *    handler exactly: cancelled orders are excluded from revenue, order count
 *    and average, but still counted in the status breakdown.
 */

const north = { kind: "branch", outletId: "outlet-north" } as const;
const all = { kind: "all" } as const;

const RANGE = { startDate: 1_000, endDate: 2_000 };

function order(overrides: Record<string, unknown> = {}) {
  return {
    _id: "o1",
    _creationTime: 1_500,
    status: "pending",
    total: 100,
    customerData: { outlet_id: "outlet-north" },
    ...overrides,
  };
}

describe("filterQueueToScope", () => {
  const queue = {
    pending: [
      order({ _id: "n1" }),
      order({ _id: "s1", customerData: { outlet_id: "outlet-south" } }),
    ],
    confirmed: [order({ _id: "s2", customerData: { outlet_id: "outlet-south" } })],
    preparing: [],
    ready: [order({ _id: "n2" })],
  };

  it("returns the same object for an all-branch account", () => {
    expect(filterQueueToScope(all, queue)).toBe(queue);
  });

  it("keeps only this branch's orders inside each status bucket", () => {
    const scoped = filterQueueToScope(north, queue);

    expect(scoped.pending.map((o) => o._id)).toEqual(["n1"]);
    expect(scoped.ready.map((o) => o._id)).toEqual(["n2"]);
  });

  it("keeps a status key whose orders all belonged to another branch", () => {
    // Dropping the key would remove the column from the status pipeline; the
    // merchant must see "Confirmed 0", not a missing stage.
    const scoped = filterQueueToScope(north, queue);

    expect(Object.keys(scoped).sort()).toEqual(["confirmed", "pending", "preparing", "ready"]);
    expect(scoped.confirmed).toEqual([]);
  });

  it("passes undefined through as an empty queue", () => {
    expect(filterQueueToScope(north, undefined)).toEqual({});
  });
});

describe("deriveStatsForScope", () => {
  it("counts only this branch's orders", () => {
    const orders = [
      order({ _id: "n1", total: 100 }),
      order({ _id: "s1", total: 900, customerData: { outlet_id: "outlet-south" } }),
    ];

    const stats = deriveStatsForScope(north, orders, RANGE);

    expect(stats.totalOrders).toBe(1);
    expect(stats.totalRevenue).toBe(100);
  });

  it("excludes cancelled orders from revenue, count and average", () => {
    // Mirrors the Convex handler: a cancellation must not inflate takings.
    const orders = [
      order({ _id: "n1", total: 100 }),
      order({ _id: "n2", total: 500, status: "cancelled" }),
    ];

    const stats = deriveStatsForScope(north, orders, RANGE);

    expect(stats.totalOrders).toBe(1);
    expect(stats.totalRevenue).toBe(100);
    expect(stats.avgOrderValue).toBe(100);
  });

  it("still counts cancelled orders in the status breakdown", () => {
    const orders = [order({ _id: "n2", total: 500, status: "cancelled" })];

    expect(deriveStatsForScope(north, orders, RANGE).statusCounts.cancelled).toBe(1);
  });

  it("reports every status even when none occurred", () => {
    const stats = deriveStatsForScope(north, [], RANGE);

    expect(stats.statusCounts).toEqual({
      pending: 0,
      confirmed: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    });
  });

  it("ignores orders outside the selected period", () => {
    const orders = [
      order({ _id: "n1", total: 100, _creationTime: 1_500 }),
      order({ _id: "old", total: 999, _creationTime: 500 }),
      order({ _id: "future", total: 999, _creationTime: 9_999 }),
    ];

    const stats = deriveStatsForScope(north, orders, RANGE);

    expect(stats.totalOrders).toBe(1);
    expect(stats.totalRevenue).toBe(100);
  });

  it("includes orders exactly on the period boundaries", () => {
    const orders = [
      order({ _id: "start", total: 10, _creationTime: RANGE.startDate }),
      order({ _id: "end", total: 20, _creationTime: RANGE.endDate }),
    ];

    expect(deriveStatsForScope(north, orders, RANGE).totalOrders).toBe(2);
  });

  it("reports a zero average rather than NaN when nothing sold", () => {
    expect(deriveStatsForScope(north, [], RANGE).avgOrderValue).toBe(0);
  });

  it("tolerates a still-loading order list", () => {
    expect(deriveStatsForScope(north, undefined, RANGE).totalOrders).toBe(0);
  });

  it("counts every branch for an all-branch account", () => {
    const orders = [
      order({ _id: "n1", total: 100 }),
      order({ _id: "s1", total: 900, customerData: { outlet_id: "outlet-south" } }),
      order({ _id: "unassigned", total: 50, customerData: {} }),
    ];

    const stats = deriveStatsForScope(all, orders, RANGE);

    expect(stats.totalOrders).toBe(3);
    expect(stats.totalRevenue).toBe(1050);
  });
});
