import { summarizeOrderStats, startOfTodayISO } from "@/lib/order-stats";

/**
 * The dashboard's today-at-a-glance numbers. Extracted from `orders-service` so
 * the tenant-project path (P5) reports identically to the platform path instead
 * of growing a second, subtly different implementation.
 */

describe("summarizeOrderStats", () => {
  it("counts orders and revenue for the day", () => {
    const stats = summarizeOrderStats([
      { status: "pending", total: 100 },
      { status: "ready", total: 250 },
    ]);

    expect(stats.todayOrders).toBe(2);
    expect(stats.todayRevenue).toBe(350);
  });

  it("excludes cancelled orders from the count and revenue", () => {
    const stats = summarizeOrderStats([
      { status: "pending", total: 100 },
      { status: "cancelled", total: 999 },
    ]);

    expect(stats.todayOrders).toBe(1);
    expect(stats.todayRevenue).toBe(100);
  });

  it("still breaks down every status, cancelled included in its own bucket", () => {
    const stats = summarizeOrderStats([
      { status: "pending", total: 10 },
      { status: "pending", total: 10 },
      { status: "confirmed", total: 10 },
      { status: "preparing", total: 10 },
      { status: "ready", total: 10 },
      { status: "cancelled", total: 10 },
    ]);

    expect(stats.pendingOrders).toBe(2);
    expect(stats.confirmedOrders).toBe(1);
    expect(stats.preparingOrders).toBe(1);
    expect(stats.readyOrders).toBe(1);
  });

  it("adds up totals that arrive as numeric strings", () => {
    const stats = summarizeOrderStats([
      { status: "pending", total: "100.50" },
      { status: "ready", total: "9.50" },
    ]);

    expect(stats.todayRevenue).toBe(110);
  });

  it("returns zeroes for a day with no orders", () => {
    const stats = summarizeOrderStats([]);

    expect(stats).toEqual({
      todayOrders: 0,
      todayRevenue: 0,
      pendingOrders: 0,
      confirmedOrders: 0,
      preparingOrders: 0,
      readyOrders: 0,
    });
  });

  it("treats a null row set as an empty day rather than throwing", () => {
    expect(summarizeOrderStats(null).todayOrders).toBe(0);
  });
});

describe("startOfTodayISO", () => {
  it("returns midnight of the given day as an ISO timestamp", () => {
    const iso = startOfTodayISO(new Date(2026, 6, 25, 14, 30, 0));

    expect(new Date(iso).getHours()).toBe(0);
    expect(new Date(iso).getMinutes()).toBe(0);
    expect(new Date(iso).getDate()).toBe(25);
  });
});
