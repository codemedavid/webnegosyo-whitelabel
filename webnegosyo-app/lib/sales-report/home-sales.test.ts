import { canHomeReadNetSales, daySalesQuery, homeHeroTitle, homeSalesFigures, homeSalesQuery, netSalesPesos } from "./home-sales";
import type { ReportPayload } from "./types";

function payload(values: Record<string, number | null>, previous: Record<string, number | null> | null): ReportPayload {
  return {
    context: { compare: { label: "the same time last week", phrase: "", kind: "same_weekday_last_week" } },
    metrics: [],
    sections: { summary: { ok: true, data: { days: 1, values, previous } } },
  } as unknown as ReportPayload;
}

describe("Home's today figure", () => {
  it("reads net sales, not order totals (Koko 2026-11-20: ₱2,585 net, ₱2,615 with the delivery fee)", () => {
    const figures = homeSalesFigures(payload({ net_sales: 258_500, orders: 6, aov: 43_083 }, { net_sales: 200_000 }));
    expect(figures).toEqual({
      netSales: 2585,
      orders: 6,
      avgOrder: 430.83,
      previousNetSales: 2000,
      compareLabel: "the same time last week",
    });
  });

  it("asks the reports for today, compared the way Sales compares it, summary only", () => {
    expect(homeSalesQuery("t1", "branch-1")).toEqual({
      tenantId: "t1",
      period: { preset: "today" },
      compare: "previous",
      branch: "branch-1",
      sections: ["summary"],
    });
  });

  it("gives nothing when the summary was refused or failed (Home keeps its own figure)", () => {
    const refused = {
      ...payload({}, null),
      sections: { summary: { ok: false, error: { kind: "forbidden", message: "no" } } },
    } as unknown as ReportPayload;
    expect(homeSalesFigures(refused)).toBeNull();
    expect(homeSalesFigures(null)).toBeNull();
  });

  it("only platform accounts that may read reports ask", () => {
    const owner = { role: "admin", isOwner: true, permissions: null };
    const cashier = { role: "admin", isOwner: false, permissions: ["pos", "orders"] };
    expect(canHomeReadNetSales("platform", owner)).toBe(true);
    expect(canHomeReadNetSales("platform", cashier)).toBe(false);
    expect(canHomeReadNetSales("convex", owner)).toBe(false);
  });

  it("names the number for what it is", () => {
    expect(homeHeroTitle(true, "platform")).toBe("Net sales");
    expect(homeHeroTitle(false, "platform")).toBe("Orders total");
    expect(homeHeroTitle(false, "convex")).toBe("Revenue");
  });
});

describe("the daily report's sales figure", () => {
  it("reads one business day's net sales, uncompared", () => {
    expect(daySalesQuery("t1", "2026-11-20", null)).toEqual({
      tenantId: "t1",
      period: { preset: "custom", from: "2026-11-20", to: "2026-11-20" },
      compare: "none",
      branch: null,
      sections: ["summary"],
    });
    expect(netSalesPesos(payload({ net_sales: 258_500, orders: 6 }, null))).toBe(2585);
    expect(netSalesPesos(null)).toBeUndefined();
  });
});
