import { buildTrend, labelledBarIndexes, paymentRowsForDisplay, receivedBridge, shareRows, trendMetrics, whatChanged } from "./overview-view";
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
      { key: "sales", text: "Net sales are up ₱200 (+20%) on last week.", tone: "good", target: null },
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

describe("how net sales become money received", () => {
  it("closes Koko Coffee's day: ₱2,575 net sales + ₱30 delivery = ₱2,605 received", () => {
    const bridge = receivedBridge({ net_sales: 257_500, delivery_fees: 3_000, service_charge: 0, still_to_collect: 0, money_received: 260_500 });
    expect(bridge).toEqual({
      lines: [
        { key: "net_sales", label: "Net sales", cents: 257_500, text: "₱2,575" },
        { key: "delivery_fees", label: "+ Delivery fees", cents: 3_000, text: "₱30" },
      ],
      receivedCents: 260_500,
      receivedText: "₱2,605",
    });
  });

  it("takes out what is still owed and names money taken beyond the bill", () => {
    const bridge = receivedBridge({ net_sales: 100_000, delivery_fees: 0, service_charge: 5_000, still_to_collect: 20_000, money_received: 86_000 });
    expect(bridge?.lines.map((line) => [line.label, line.cents])).toEqual([
      ["Net sales", 100_000],
      ["+ Service charge", 5_000],
      ["− Still to collect", -20_000],
      ["+ Paid more than owed", 1_000],
    ]);
  });

  it("always sums to the money received, to the centavo", () => {
    const cases = [
      { net_sales: 0, money_received: 0 },
      { net_sales: 12_345, delivery_fees: 678, still_to_collect: 999, money_received: 11_000 },
      { net_sales: 50_000, money_received: 70_000 },
      { net_sales: 50_000, service_charge: 2_500, money_received: 30_000 },
    ];
    for (const values of cases) {
      const bridge = receivedBridge(values);
      expect(bridge?.lines.reduce((sum, line) => sum + line.cents, 0)).toBe(values.money_received);
    }
  });

  it("draws nothing without both figures", () => {
    expect(receivedBridge(null)).toBeNull();
    expect(receivedBridge({ net_sales: 100 })).toBeNull();
    expect(receivedBridge({ money_received: 100 })).toBeNull();
  });

  it("names money taken with no method in words an owner reads", () => {
    const rows = paymentRowsForDisplay([
      { key: "id:cash", label: "Cash", values: { money_received: 1 } },
      { key: "unspecified", label: "Not recorded", values: { money_received: 2 } },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Cash", "Paid, method not picked"]);
  });
});

describe("the trend without food costs", () => {
  it("offers no gross profit tab when every bucket is — (nothing costed)", () => {
    const rows: ReportRow[] = [{ key: "a", label: "a", values: { net_sales: 1, gross_profit: null } }];
    expect(trendMetrics(rows, [metric("net_sales"), metric("gross_profit")]).map((m) => m.id)).toEqual(["net_sales"]);
  });
});
