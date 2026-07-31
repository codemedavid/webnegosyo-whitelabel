/**
 * The dashboard figures, and which branch they describe.
 *
 * `getDashboardStats` and `getDashboardStatsByPeriod` computed the same four
 * figures from two near-identical copies, neither of which had any automated
 * coverage — the same gap `orderRevise.ts` was extracted to close.
 *
 * The reason it matters now: the daily inventory report divides the day's stock
 * cost by these takings. Once the stock half can be narrowed to one branch and
 * the takings half cannot, a branch manager's food cost is understated by
 * roughly the number of branches — and an understated food cost is the
 * direction that gets believed rather than investigated.
 */

import { summarizeOrderStats } from "./orderStats";

const sale = (total: number, extra: Record<string, unknown> = {}) => ({
  total,
  status: "delivered",
  ...extra,
});

describe("summarizeOrderStats", () => {
  it("sums what the store took", () => {
    const stats = summarizeOrderStats([sale(300), sale(200)]);

    expect(stats.totalRevenue).toBe(500);
    expect(stats.totalOrders).toBe(2);
    expect(stats.avgOrderValue).toBe(250);
  });

  it("keeps a cancelled order out of the takings but still counts its status", () => {
    // Revenue must not include it — nobody paid. The status tally must, because
    // that panel exists to show how the day went, cancellations included.
    const stats = summarizeOrderStats([sale(300), sale(999, { status: "cancelled" })]);

    expect(stats.totalRevenue).toBe(300);
    expect(stats.totalOrders).toBe(1);
    expect(stats.statusCounts.cancelled).toBe(1);
  });

  it("reports zero rather than NaN for a day with nothing in it", () => {
    // A NaN average reaches the screen as "NaN" and reads as a broken backend.
    const stats = summarizeOrderStats([]);

    expect(stats.totalRevenue).toBe(0);
    expect(stats.avgOrderValue).toBe(0);
  });

  it("ignores a status it has never heard of instead of throwing", () => {
    // The tally was indexed blind (`statusCounts[order.status]++`). A status
    // added by a later schema would have made it NaN and taken the whole
    // dashboard query down with it.
    const stats = summarizeOrderStats([sale(100, { status: "refunded" })]);

    expect(stats.totalRevenue).toBe(100);
    expect(stats.statusCounts.pending).toBe(0);
  });
});

describe("summarizeOrderStats — one branch of the store", () => {
  it("counts only the named branch's takings", () => {
    const stats = summarizeOrderStats(
      [sale(300, { outletId: "north" }), sale(200, { outletId: "south" })],
      "north",
    );

    expect(stats.totalRevenue).toBe(300);
    expect(stats.totalOrders).toBe(1);
  });

  it("finds a branch order that predates the outletId column", () => {
    // Every order already in a tenant's database carries its branch only in
    // customerData. Reading the column alone would hide them and report the
    // branch as having taken nothing — a food cost of infinity.
    const stats = summarizeOrderStats(
      [sale(300, { customerData: { outlet_id: "north" } })],
      "north",
    );

    expect(stats.totalRevenue).toBe(300);
  });

  it("does not credit an unbranched order to a branch", () => {
    // It belongs to no branch. Attributing it would inflate one branch's
    // takings and understate its food cost.
    const stats = summarizeOrderStats([sale(300)], "north");

    expect(stats.totalRevenue).toBe(0);
  });

  it("counts every branch when none is named", () => {
    // The store-wide read is the default and must not change behaviour for the
    // tenants who have always used it.
    const stats = summarizeOrderStats([
      sale(300, { outletId: "north" }),
      sale(200, { outletId: "south" }),
      sale(100),
    ]);

    expect(stats.totalRevenue).toBe(600);
  });
});
