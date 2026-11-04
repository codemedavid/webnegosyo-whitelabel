import { describeChange, formatMetric, formatMetricShort } from "./format";
import type { MetricDef } from "./types";

const def = (overrides: Partial<MetricDef>): MetricDef => ({
  id: "net_sales",
  label: "Sales",
  hint: "",
  definition: "",
  format: "money",
  aggregation: "sum",
  goodDirection: "up",
  permission: "reports",
  scopes: ["summary"],
  ...overrides,
});

describe("formatMetric", () => {
  it("money is whole pesos from centavos, with separators and a real minus", () => {
    expect(formatMetric(123_456_78, "money")).toBe("₱123,457");
    expect(formatMetric(-50_000, "money")).toBe("−₱500");
    expect(formatMetric(0, "money")).toBe("₱0");
  });

  it("counts, decimals and percentages", () => {
    expect(formatMetric(12_345, "count")).toBe("12,345");
    expect(formatMetric(4.256, "decimal")).toBe("4.3");
    expect(formatMetric(0.3456, "percent")).toBe("34.6%");
  });

  it("unknown or impossible values read as a dash, never 0", () => {
    expect(formatMetric(null, "money")).toBe("—");
    expect(formatMetric(undefined, "percent")).toBe("—");
    expect(formatMetric(Number.NaN, "count")).toBe("—");
  });

  it("short money for chart labels", () => {
    expect(formatMetricShort(1_250_000_00, "money")).toBe("₱1.3M");
    expect(formatMetricShort(45_600_00, "money")).toBe("₱45.6k");
    expect(formatMetricShort(950_00, "money")).toBe("₱950");
    expect(formatMetricShort(0.5, "percent")).toBe("50%");
  });
});

describe("describeChange", () => {
  it("says how much and which way, and whether that is good", () => {
    expect(describeChange(120_000, 100_000, def({}))).toEqual({ text: "▲ ₱200 (+20%)", tone: "good", arrow: "up" });
    expect(describeChange(80, 100, def({ format: "count" }))).toEqual({ text: "▼ 20 (−20%)", tone: "bad", arrow: "down" });
  });

  it("a cost going up is bad news", () => {
    expect(describeChange(0.35, 0.3, def({ format: "percent", goodDirection: "down" }))).toEqual({
      text: "▲ 5.0 pts",
      tone: "bad",
      arrow: "up",
    });
  });

  it("no change, no earlier figure, or a metric with no good side", () => {
    expect(describeChange(100, 100, def({ format: "count" }))).toEqual({ text: "Same as before", tone: "neutral", arrow: "flat" });
    expect(describeChange(100, null, def({}))).toEqual({ text: "No earlier figure", tone: "neutral", arrow: "flat" });
    expect(describeChange(100, 0, def({ format: "count" }))).toEqual({ text: "▲ 100 (new)", tone: "good", arrow: "up" });
    expect(describeChange(300, 100, def({ goodDirection: "none" })).tone).toBe("neutral");
  });
});
