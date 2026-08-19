/**
 * Full analytics report as a single sectioned CSV.
 *
 * Flattens everything the Analytics screen shows — sales KPIs, breakdowns,
 * payment detail, peak hours, customer insights, upsell funnel, bundles, and
 * top items — into one document the merchant can open in Excel. Each dataset
 * the screen loads is optional here for the same reason sections hide on
 * screen: a tenant's Convex deployment may predate a query. A missing dataset
 * exports as "Not available" so the report never silently omits a section.
 *
 * Pure string building only; the share sheet lives in `share.ts`.
 */

import { describePeakHour } from "../analytics-utils";
import { csvCell, CSV_BOM, type CsvValue } from "./csv";
import { formatExportDateTime } from "./dates";

export interface AnalyticsSales {
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  avgOrderValue: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  cancellationRate: number;
  ordersBySource: { web: number; mobile: number };
  ordersByStatus: Record<string, number>;
  revenueGrowth: number;
}

export interface AnalyticsRevenueBreakdown {
  byOrderType: { type: string; revenue: number; count: number }[];
  byPaymentMethod: { method: string; revenue: number; count: number }[];
}

export interface AnalyticsPaymentMethods {
  methods: {
    method: string;
    count: number;
    revenue: number;
    percentage: number;
    avgOrderValue: number;
  }[];
  dailyBreakdown: { date: string; methods: Record<string, number> }[];
}

export interface AnalyticsHeatmap {
  heatmap: { day: number; hour: number; count: number }[];
  peakHour: { day: number; hour: number; count: number };
  quietHour: { day: number; hour: number; count: number };
}

export interface AnalyticsCustomerInsights {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  returnRate: number;
  avgOrdersPerCustomer: number;
  avgRevenuePerCustomer: number;
  topCustomers: {
    name: string;
    contact: string;
    orderCount: number;
    totalSpent: number;
    lastOrderDate: number;
  }[];
}

export interface AnalyticsUpsellStats {
  shown: number;
  clicked: number;
  converted: number;
  clickRate: number;
  conversionRate: number;
}

export interface AnalyticsUpsellTrends {
  dailyRates: { date: string; rate: number }[];
  totalUpsellRevenue: number;
}

export interface AnalyticsBundleStats {
  viewed: number;
  added: number;
  conversionRate: number;
}

export interface AnalyticsTopItem {
  itemId: string;
  name: string;
  count: number;
  revenue: number;
}

export interface AnalyticsReportInput {
  daysBack: number;
  nowMs: number;
  sales?: AnalyticsSales | null;
  revenueBreakdown?: AnalyticsRevenueBreakdown | null;
  paymentAnalytics?: AnalyticsPaymentMethods | null;
  heatmap?: AnalyticsHeatmap | null;
  customerInsights?: AnalyticsCustomerInsights | null;
  upsellStats?: AnalyticsUpsellStats | null;
  upsellTrends?: AnalyticsUpsellTrends | null;
  bundleStats?: AnalyticsBundleStats | null;
  topItems?: AnalyticsTopItem[] | null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const NOT_AVAILABLE_ROW: readonly CsvValue[] = [
  "Not available (backend update needed)",
];

/** A raw decimal rate (0.048) as a human percentage number (4.8). */
function asPercent(rate: number): number {
  return Math.round(rate * 1000) / 10;
}

function row(...cells: readonly CsvValue[]): string {
  return cells.map(csvCell).join(",");
}

/** One titled block: title row, optional header, then data rows. */
function section(
  title: string,
  headers: readonly string[] | null,
  rows: readonly (readonly CsvValue[])[]
): string[] {
  const lines = [row(title)];
  if (headers) lines.push(row(...headers));
  for (const cells of rows) lines.push(row(...cells));
  lines.push("");
  return lines;
}

function missingSection(title: string): string[] {
  return section(title, null, [NOT_AVAILABLE_ROW]);
}

function salesSections(sales: AnalyticsSales | null | undefined): string[] {
  if (!sales) {
    return [...missingSection("SALES OVERVIEW"), ...missingSection("ORDERS BY STATUS")];
  }
  const overview = section("SALES OVERVIEW", ["Metric", "Value"], [
    ["Total revenue", sales.totalRevenue],
    ["Total orders", sales.totalOrders],
    ["Completed orders", sales.completedOrders],
    ["Average order value", sales.avgOrderValue],
    ["Cancelled orders", sales.cancelledOrders],
    ["Cancelled revenue", sales.cancelledRevenue],
    ["Cancellation rate (%)", asPercent(sales.cancellationRate)],
    ["Revenue growth vs previous period (%)", asPercent(sales.revenueGrowth)],
    ["Web orders", sales.ordersBySource.web],
    ["Mobile orders", sales.ordersBySource.mobile],
  ]);
  const byStatus = section(
    "ORDERS BY STATUS",
    ["Status", "Orders"],
    Object.entries(sales.ordersByStatus).map(([status, count]) => [status, count])
  );
  return [...overview, ...byStatus];
}

function breakdownSections(
  breakdown: AnalyticsRevenueBreakdown | null | undefined
): string[] {
  if (!breakdown) {
    return [
      ...missingSection("REVENUE BY ORDER TYPE"),
      ...missingSection("REVENUE BY PAYMENT METHOD"),
    ];
  }
  return [
    ...section(
      "REVENUE BY ORDER TYPE",
      ["Order type", "Revenue", "Orders"],
      breakdown.byOrderType.map((r) => [r.type, r.revenue, r.count])
    ),
    ...section(
      "REVENUE BY PAYMENT METHOD",
      ["Payment method", "Revenue", "Orders"],
      breakdown.byPaymentMethod.map((r) => [r.method, r.revenue, r.count])
    ),
  ];
}

function paymentDetailSection(
  payments: AnalyticsPaymentMethods | null | undefined
): string[] {
  if (!payments) return missingSection("PAYMENT METHOD DETAIL");
  return section(
    "PAYMENT METHOD DETAIL",
    ["Payment method", "Revenue", "Orders", "Share (%)", "Average order value"],
    payments.methods.map((m) => [
      m.method,
      m.revenue,
      m.count,
      asPercent(m.percentage),
      m.avgOrderValue,
    ])
  );
}

function heatmapSection(heatmap: AnalyticsHeatmap | null | undefined): string[] {
  if (!heatmap) return missingSection("PEAK HOURS");
  const summaryRows: readonly (readonly CsvValue[])[] = [
    ["Busiest", describePeakHour(heatmap.peakHour)],
    ["Quietest", describePeakHour(heatmap.quietHour)],
  ];
  const gridRows = heatmap.heatmap.map((slot) => [
    DAY_NAMES[slot.day] ?? String(slot.day),
    slot.hour,
    slot.count,
  ]);
  return [
    ...section("PEAK HOURS", null, summaryRows),
    ...section("ORDERS BY DAY AND HOUR", ["Day", "Hour", "Orders"], gridRows),
  ];
}

function customerSections(
  insights: AnalyticsCustomerInsights | null | undefined
): string[] {
  if (!insights) {
    return [...missingSection("CUSTOMERS"), ...missingSection("TOP CUSTOMERS")];
  }
  const stats = section("CUSTOMERS", ["Metric", "Value"], [
    ["Total customers", insights.totalCustomers],
    ["New customers", insights.newCustomers],
    ["Returning customers", insights.returningCustomers],
    ["Return rate (%)", asPercent(insights.returnRate)],
    ["Average orders per customer", insights.avgOrdersPerCustomer],
    ["Average revenue per customer", insights.avgRevenuePerCustomer],
  ]);
  const top = section(
    "TOP CUSTOMERS",
    ["Rank", "Name", "Contact", "Orders", "Total spent", "Last order"],
    insights.topCustomers.map((c, i) => [
      i + 1,
      c.name,
      c.contact,
      c.orderCount,
      c.totalSpent,
      formatExportDateTime(c.lastOrderDate),
    ])
  );
  return [...stats, ...top];
}

function upsellSections(
  stats: AnalyticsUpsellStats | null | undefined,
  trends: AnalyticsUpsellTrends | null | undefined
): string[] {
  const funnel = !stats
    ? missingSection("UPSELL FUNNEL")
    : section(
        "UPSELL FUNNEL",
        ["Shown", "Clicked", "Converted", "Click rate (%)", "Conversion rate (%)"],
        [[
          stats.shown,
          stats.clicked,
          stats.converted,
          asPercent(stats.clickRate),
          asPercent(stats.conversionRate),
        ]]
      );
  const trend = !trends
    ? missingSection("DAILY UPSELL CONVERSION")
    : [
        ...section("UPSELL REVENUE", ["Metric", "Value"], [
          ["Total upsell revenue", trends.totalUpsellRevenue],
        ]),
        ...section(
          "DAILY UPSELL CONVERSION",
          ["Date", "Conversion rate (%)"],
          trends.dailyRates.map((d) => [d.date, asPercent(d.rate)])
        ),
      ];
  return [...funnel, ...trend];
}

function bundleSection(stats: AnalyticsBundleStats | null | undefined): string[] {
  if (!stats) return missingSection("BUNDLES");
  return section(
    "BUNDLES",
    ["Viewed", "Added", "Conversion rate (%)"],
    [[stats.viewed, stats.added, asPercent(stats.conversionRate)]]
  );
}

function topItemsSection(items: readonly AnalyticsTopItem[] | null | undefined): string[] {
  if (!items) return missingSection("TOP ITEMS");
  return section(
    "TOP ITEMS",
    ["Rank", "Item", "Sold", "Revenue"],
    items.map((item, i) => [i + 1, item.name, item.count, item.revenue])
  );
}

/** The whole analytics screen as one Excel-openable CSV document. */
export function buildAnalyticsReportCsv(input: AnalyticsReportInput): string {
  const lines = [
    row("Analytics Report"),
    row("Period", `Last ${input.daysBack} days`),
    row("Exported", formatExportDateTime(input.nowMs)),
    "",
    ...salesSections(input.sales),
    ...breakdownSections(input.revenueBreakdown),
    ...paymentDetailSection(input.paymentAnalytics),
    ...heatmapSection(input.heatmap),
    ...customerSections(input.customerInsights),
    ...upsellSections(input.upsellStats, input.upsellTrends),
    ...bundleSection(input.bundleStats),
    ...topItemsSection(input.topItems),
  ];
  return CSV_BOM + lines.join("\r\n");
}
