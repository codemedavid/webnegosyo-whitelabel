import { growthSalesQuery, growthTrendsFromReport, shiftDayKey } from "./growth-sales";
import type { ReportPayload } from "./types";

describe("Growth reads net sales by day", () => {
  it("asks for the last N business days, today included, by day", () => {
    expect(growthSalesQuery("t1", "2026-11-24", 30)).toEqual({
      tenantId: "t1",
      period: { preset: "custom", from: "2026-10-26", to: "2026-11-24" },
      compare: "none",
      branch: null,
      sections: ["periods"],
      grain: "day",
    });
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("maps day buckets to pesos (net sales, not order totals)", () => {
    const payload = {
      sections: {
        periods: {
          ok: true,
          data: {
            grain: "day",
            rows: [
              { key: "2026-11-20", label: "", values: { net_sales: 258_500, orders: 6 } },
              { key: "2026-11-21", label: "", values: { net_sales: 0, orders: 0 } },
            ],
          },
        },
      },
    } as unknown as ReportPayload;
    expect(growthTrendsFromReport(payload)).toEqual([
      { date: "2026-11-20", totalOrders: 6, totalRevenue: 2585, avgOrderValue: 2585 / 6 },
      { date: "2026-11-21", totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
    ]);
  });

  it("gives nothing when the section was refused", () => {
    const refused = { sections: { periods: { ok: false, error: { kind: "forbidden", message: "" } } } } as unknown as ReportPayload;
    expect(growthTrendsFromReport(refused)).toBeNull();
  });
});
