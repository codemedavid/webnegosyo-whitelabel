import { compareBranches, getOrderOutletLabel } from "./branch-analytics";

/**
 * The merchant app's copy of the branch comparison.
 *
 * Kept in sync with `src/lib/outlets/branch-analytics.ts` by hand — the two
 * packages build separately and share no import. The parity that matters is
 * behavioural: an owner who reads ₱400 for North on the web must read ₱400 for
 * North in the app, so the same rules are tested on both sides.
 *
 * Cancelled orders are excluded from revenue and count, matching
 * `deriveStatsForScope` in `branch-dashboard.ts` and the Convex stats handler.
 */

function order(overrides: Record<string, unknown> = {}) {
  return {
    _id: "order-1",
    total: 100,
    status: "completed",
    ...overrides,
  };
}

function branchOrder(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return order({
    customerData: { outlet_id: id, outlet_name: name },
    ...overrides,
  });
}

describe("getOrderOutletLabel", () => {
  it("reads the branch name snapshot off a Convex order", () => {
    expect(getOrderOutletLabel(branchOrder("north", "North Branch"))).toBe("North Branch");
  });

  it("returns nothing for an order that never recorded one", () => {
    expect(getOrderOutletLabel(order())).toBeNull();
  });
});

describe("compareBranches", () => {
  it("reports revenue, count and average per branch", () => {
    const rows = compareBranches([
      branchOrder("north", "North Branch", { total: 100 }),
      branchOrder("north", "North Branch", { total: 300 }),
      branchOrder("south", "South", { total: 50 }),
    ]);

    expect(rows.find((r) => r.outletId === "north")).toMatchObject({
      revenue: 400,
      orderCount: 2,
      averageOrderValue: 200,
    });
  });

  it("excludes cancelled orders from revenue and count", () => {
    const rows = compareBranches([
      branchOrder("north", "North Branch", { total: 100 }),
      branchOrder("north", "North Branch", { total: 900, status: "cancelled" }),
    ]);

    expect(rows[0]).toMatchObject({ revenue: 100, orderCount: 1 });
  });

  it("collects unattributed orders into an explicit Unassigned row", () => {
    const rows = compareBranches([branchOrder("north", "North Branch"), order({ _id: "legacy" })]);

    expect(rows.find((r) => r.outletId === null)?.outletName).toBe("Unassigned");
  });

  it("keeps Unassigned last however much revenue it holds", () => {
    const rows = compareBranches([
      branchOrder("north", "North Branch", { total: 10 }),
      order({ total: 9999 }),
    ]);

    expect(rows[rows.length - 1].outletId).toBeNull();
  });

  it("ranks branches by revenue, highest first", () => {
    const rows = compareBranches([
      branchOrder("north", "North Branch", { total: 10 }),
      branchOrder("south", "South", { total: 500 }),
    ]);

    expect(rows.map((r) => r.outletId)).toEqual(["south", "north"]);
  });

  it("sums to the store total across every row including Unassigned", () => {
    const rows = compareBranches([
      branchOrder("north", "North Branch", { total: 100 }),
      branchOrder("south", "South", { total: 250 }),
      order({ total: 75 }),
      branchOrder("north", "North Branch", { total: 999, status: "cancelled" }),
    ]);

    expect(rows.reduce((sum, r) => sum + r.revenue, 0)).toBe(425);
    expect(rows.reduce((sum, r) => sum + r.orderCount, 0)).toBe(3);
  });

  it("reports a zero average rather than dividing by zero", () => {
    const rows = compareBranches([branchOrder("north", "North Branch", { status: "cancelled" })]);

    expect(rows[0].averageOrderValue).toBe(0);
  });

  it("reports a zero share rather than NaN when the store took nothing", () => {
    const rows = compareBranches([branchOrder("north", "North Branch", { total: 0 })]);

    expect(rows[0].revenueShare).toBe(0);
  });

  it("treats a missing total as zero rather than producing NaN revenue", () => {
    const rows = compareBranches([branchOrder("north", "North Branch", { total: undefined })]);

    expect(rows[0].revenue).toBe(0);
  });

  it("falls back to the branch id when no name was ever recorded", () => {
    const rows = compareBranches([order({ customerData: { outlet_id: "ghost" } })]);

    expect(rows[0].outletName).toBe("ghost");
  });

  it("returns nothing for an empty order list", () => {
    expect(compareBranches([])).toEqual([]);
  });
});
