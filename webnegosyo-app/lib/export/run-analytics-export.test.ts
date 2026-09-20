import { runAnalyticsExport } from "./run-export";
import type { ShareCsvInput } from "./share";

/** 2026-08-19 ~16:00 Manila. */
const NOW_MS = Date.UTC(2026, 7, 19, 8, 0, 0);

describe("runAnalyticsExport", () => {
  it("builds the report and shares it under a period-stamped file name", async () => {
    const shared: ShareCsvInput[] = [];
    const share = jest.fn(async (input: ShareCsvInput) => {
      shared.push(input);
      return `file:///cache/${input.fileName}`;
    });

    await runAnalyticsExport({
      periodLabel: "Last 30 days",
      nowMs: NOW_MS,
      sales: null,
      revenueBreakdown: null,
      paymentAnalytics: null,
      heatmap: null,
      customerInsights: null,
      upsellStats: null,
      upsellTrends: null,
      bundleStats: null,
      topItems: null,
      share,
    });

    expect(share).toHaveBeenCalledTimes(1);
    expect(shared[0].fileName).toBe("analytics_last-30-days_2026-08-19.csv");
    expect(shared[0].csv).toContain("Analytics Report");
    expect(shared[0].csv).toContain("Last 30 days");
  });
});
