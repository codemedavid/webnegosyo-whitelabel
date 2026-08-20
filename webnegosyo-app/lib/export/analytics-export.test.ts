import {
  buildAnalyticsReportCsv,
  type AnalyticsReportInput,
} from "./analytics-export";
import { CSV_BOM } from "./csv";

/** 2026-08-19 ~16:00 Manila. */
const NOW_MS = Date.UTC(2026, 7, 19, 8, 0, 0);

function fullInput(): AnalyticsReportInput {
  return {
    daysBack: 7,
    nowMs: NOW_MS,
    sales: {
      totalRevenue: 12500,
      totalOrders: 42,
      completedOrders: 40,
      avgOrderValue: 297.6,
      cancelledOrders: 2,
      cancelledRevenue: 500,
      cancellationRate: 0.0476,
      ordersBySource: { web: 30, mobile: 12 },
      ordersByStatus: { pending: 1, delivered: 40, cancelled: 2 },
      revenueGrowth: 0.15,
    },
    revenueBreakdown: {
      byOrderType: [{ type: "delivery", revenue: 9000, count: 30 }],
      byPaymentMethod: [{ method: "GCash", revenue: 7000, count: 25 }],
    },
    paymentAnalytics: {
      methods: [
        { method: "GCash", count: 25, revenue: 7000, percentage: 0.56, avgOrderValue: 280 },
      ],
      dailyBreakdown: [],
    },
    heatmap: {
      heatmap: [{ day: 1, hour: 12, count: 9 }],
      peakHour: { day: 1, hour: 12, count: 9 },
      quietHour: { day: 0, hour: 4, count: 0 },
    },
    customerInsights: {
      totalCustomers: 20,
      newCustomers: 8,
      returningCustomers: 12,
      returnRate: 0.6,
      avgOrdersPerCustomer: 2.1,
      avgRevenuePerCustomer: 625,
      topCustomers: [
        {
          name: "=HYPERLINK(evil)",
          contact: "0917",
          orderCount: 5,
          totalSpent: 2000,
          lastOrderDate: NOW_MS,
        },
      ],
    },
    upsellStats: { shown: 100, clicked: 30, converted: 10, clickRate: 0.3, conversionRate: 0.1 },
    upsellTrends: {
      dailyRates: [{ date: "2026-08-18", rate: 0.12 }],
      totalUpsellRevenue: 1500,
    },
    bundleStats: { viewed: 50, added: 5, conversionRate: 0.1 },
    topItems: [{ itemId: "i1", name: "Spanish Latte", count: 18, revenue: 2700 }],
  };
}

describe("buildAnalyticsReportCsv", () => {
  it("starts with the BOM and a report header naming the period", () => {
    const csv = buildAnalyticsReportCsv(fullInput());

    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toContain("Analytics Report");
    expect(csv).toContain("Last 7 days");
  });

  it("includes every section of the analytics screen", () => {
    const csv = buildAnalyticsReportCsv(fullInput());

    for (const section of [
      "SALES OVERVIEW",
      "REVENUE BY ORDER TYPE",
      "REVENUE BY PAYMENT METHOD",
      "PAYMENT METHOD DETAIL",
      "ORDERS BY STATUS",
      "PEAK HOURS",
      "CUSTOMERS",
      "TOP CUSTOMERS",
      "UPSELL FUNNEL",
      "DAILY UPSELL CONVERSION",
      "BUNDLES",
      "TOP ITEMS",
    ]) {
      expect(csv).toContain(section);
    }
  });

  it("flattens the sales KPIs as metric/value rows", () => {
    const csv = buildAnalyticsReportCsv(fullInput());

    expect(csv).toContain("Total revenue,12500");
    expect(csv).toContain("Total orders,42");
    expect(csv).toContain("Cancelled orders,2");
    expect(csv).toContain("Web orders,30");
    expect(csv).toContain("Mobile orders,12");
  });

  it("exports rates as human percentages, not raw decimals", () => {
    const csv = buildAnalyticsReportCsv(fullInput());

    expect(csv).toContain("Cancellation rate (%),4.8");
    expect(csv).toContain("Return rate (%),60");
    expect(csv).toContain("100,30,10,30,10"); // funnel row: shown,clicked,converted,click%,conv%
  });

  it("renders heatmap slots with day names and marks peak and quiet hours", () => {
    const csv = buildAnalyticsReportCsv(fullInput());

    expect(csv).toContain("Mon,12,9");
    expect(csv).toMatch(/Busiest/);
    expect(csv).toMatch(/Quietest/);
  });

  it("formula-guards attacker-controlled strings like customer names", () => {
    const csv = buildAnalyticsReportCsv(fullInput());

    expect(csv).toContain("'=HYPERLINK(evil)");
    expect(csv).not.toContain(",=HYPERLINK(evil)");
  });

  it("marks a section as not available when its dataset is missing", () => {
    const input = { ...fullInput(), sales: null, heatmap: undefined };

    const csv = buildAnalyticsReportCsv(input);

    expect(csv).toContain("SALES OVERVIEW");
    expect(csv).toContain("PEAK HOURS");
    const notAvailable = csv.split("\r\n").filter((l) => l.includes("Not available"));
    expect(notAvailable.length).toBeGreaterThanOrEqual(2);
  });

  it("ranks top items and top customers starting at 1", () => {
    const csv = buildAnalyticsReportCsv(fullInput());

    expect(csv).toContain("1,Spanish Latte,18,2700");
  });
});
