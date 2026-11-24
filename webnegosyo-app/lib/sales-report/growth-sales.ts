/**
 * Growth's daily figures from the web's one sales definition (platform stores).
 *
 * Growth used `analytics:getTrends`, which on the platform adds up order
 * totals — delivery fees and unpaid orders included — so its "Revenue · Last
 * 30 days" never matched Sales for the same days (Koko Coffee, 2026-11-24).
 * Platform stores now read the reports' day buckets (net sales, orders) and
 * the screen labels them "Net sales". Convex stores keep getTrends.
 */

import type { DailyTrend } from "../growth-metrics";
import type { ReportPayload, ReportQuery } from "./types";

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` shifted by whole days (calendar arithmetic, no time zone). */
export function shiftDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The last `daysBack` business days, today included, one bucket per day. */
export function growthSalesQuery(
  tenantId: string,
  todayKey: string,
  daysBack: number,
  branch: string | null = null,
): ReportQuery {
  return {
    tenantId,
    period: { preset: "custom", from: shiftDayKey(todayKey, 1 - daysBack), to: todayKey },
    compare: "none",
    branch,
    sections: ["periods"],
    grain: "day",
  };
}

/** Day buckets as Growth's trend rows (pesos), or null when the section did not answer. */
export function growthTrendsFromReport(payload: ReportPayload | null | undefined): DailyTrend[] | null {
  const periods = payload?.sections.periods;
  if (!periods?.ok) return null;
  return periods.data.rows.map((row) => {
    const orders = typeof row.values.orders === "number" ? row.values.orders : 0;
    const revenue = typeof row.values.net_sales === "number" ? row.values.net_sales / 100 : 0;
    return { date: row.key, totalOrders: orders, totalRevenue: revenue, avgOrderValue: orders > 0 ? revenue / orders : 0 };
  });
}
