import { buildTrend, labelledBarIndexes, shareRows, trendMetrics, whatChanged } from "./overview-view";
import type { MetricDef, MetricId, ReportRow, ReportSections } from "./types";

const metric = (id: MetricId, format: MetricDef["format"] = "money"): MetricDef => ({
  id,
  label: id,
  hint: "",
  definition: "",
  format,
  aggregation: "sum",
  goodDirection: "up",
  permission: "reports",
  scopes: ["summary", "period"],
});

const METRICS = [metric("net_sales"), metric("orders", "count"), metric("aov"), metric("still_to_collect")];

const row = (key: string, net: number, previous?: number | null): ReportRow => ({
  key,
  label: key,
  values: { net_sales: net, orders: 1 },
  ...(previous === undefined ? {} : { previous: previous === null ? null : { net_sales: previous } }),
});

describe("the trend", () => {
  it("offers only the metrics the rows carry", () => {
    expect(trendMetrics([row("a", 1)], METRICS).map((m) => m.id)).toEqual(["net_sales", "orders"]);
  });

  it("bars carry the compared bucket and the scale fits both", () => {
    const trend = buildTrend([row("Oct 1", 500, 900), row("Oct 2", 700, null)], METRICS[0]);
    expect(trend.bars).toEqual([
      { key: "Oct 1", label: "Oct 1", value: 500, previous: 900 },
      { key: "Oct 2", label: "Oct 2", value: 700, previous: null },
    ]);
    expect(trend.max).toBe(900);
  });

  it("names the first and last bar and a few evenly between", () => {
    expect(labelledBarIndexes(3)).toEqual([0, 1, 2]);
    expect(labelledBarIndexes(30)).toEqual([0, 15, 29]);
    expect(labelledBarIndexes(12, 2)).toEqual([0, 4, 7, 11]);
    expect(labelledBarIndexes(0)).toEqual([]);
  });
});

describe("what changed", () => {
  const sections: ReportSections = {
    summary: { ok: true, data: { days: 7, values: { net_sales: 120_000, still_to_collect: 50_000 }, previous: { net_sales: 100_000 } } },
    items: { ok: true, data: { rows: [row("Tapsilog", 60_000, 40_000), row("Latte", 30_000, 35_000)] } },
  };

  it("says how sales moved, which dish moved them most, and what is unpaid", () => {
    expect(whatChanged(sections, METRICS, "on last week")).toEqual([
      { key: "sales", text: "Sales are up ₱200 (+20%) on last week.", tone: "good", target: null },
      { key: "mover", text: "Tapsilog brought in ₱200 more than before.", tone: "good", target: "items" },
      { key: "unpaid", text: "₱500 is still to collect.", tone: "neutral", target: "orders" },
    ]);
  });

  it("says nothing it cannot back: no comparison, no sales line or mover", () => {
    const flat: ReportSections = {
      summary: { ok: true, data: { days: 7, values: { net_sales: 1 }, previous: null } },
      items: { ok: true, data: { rows: [row("Tapsilog", 60)] } },
    };
    expect(whatChanged(flat, METRICS, null)).toEqual([]);
  });
});

describe("share rows", () => {
  it("ranks the largest rows with their share of the whole", () => {
    const rows = shareRows([row("a", 300), row("b", 100), row("c", 0)], "net_sales", "money", 2);
    expect(rows).toEqual([
      { key: "a", label: "a", valueText: "₱3", share: 0.75, detail: null },
      { key: "b", label: "b", valueText: "₱1", share: 0.25, detail: null },
    ]);
  });
});
