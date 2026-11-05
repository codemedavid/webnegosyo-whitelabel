import { MAX_CARDS, cardValues, moveCard, overviewSections, resolveCards, toggleCard } from "./cards";
import type { MetricDef, MetricId } from "./types";

function metric(id: MetricId, overrides: Partial<MetricDef> = {}): MetricDef {
  return {
    id,
    label: id,
    hint: "",
    definition: "",
    format: "money",
    aggregation: "sum",
    goodDirection: "up",
    permission: "reports",
    scopes: ["summary"],
    ...overrides,
  };
}

const VISIBLE = [
  metric("net_sales"),
  metric("orders"),
  metric("aov"),
  metric("avg_orders_per_day"),
  metric("items_sold"),
  metric("money_received"),
  metric("share_of_sales", { scopes: ["breakdown"] }),
  metric("gross_margin_pct", { permission: "costs", format: "percent" }),
];

describe("resolveCards", () => {
  it("starts on the default cards the caller may see", () => {
    expect(resolveCards(null, VISIBLE).map((m) => m.id)).toEqual([
      "net_sales",
      "orders",
      "aov",
      "avg_orders_per_day",
      "gross_margin_pct",
      "items_sold",
    ]);
  });

  it("swaps the margin card for money received without cost access", () => {
    const noCosts = VISIBLE.filter((m) => m.permission !== "costs");
    expect(resolveCards(null, noCosts).map((m) => m.id)).toContain("money_received");
  });

  it("keeps the owner's own order, dropping what this account may not see or what is not a period figure", () => {
    const chosen: MetricId[] = ["orders", "gross_margin_pct", "share_of_sales", "net_sales"];
    const noCosts = VISIBLE.filter((m) => m.permission !== "costs");
    expect(resolveCards(chosen, noCosts).map((m) => m.id)).toEqual(["orders", "net_sales"]);
  });

  it("falls back to the defaults when nothing chosen survives", () => {
    expect(resolveCards(["share_of_sales"], VISIBLE)).toHaveLength(6);
  });
});

describe("editing the cards", () => {
  it("adds at the end and removes, never past the limit", () => {
    expect(toggleCard(["net_sales"], "orders")).toEqual(["net_sales", "orders"]);
    expect(toggleCard(["net_sales", "orders"], "net_sales")).toEqual(["orders"]);
    const full: MetricId[] = ["net_sales", "orders", "aov", "items_sold", "money_received", "discounts", "gross_sales", "expenses"];
    expect(full).toHaveLength(MAX_CARDS);
    expect(toggleCard(full, "profit")).toEqual(full);
  });

  it("moves a card up or down, and does nothing at the edges", () => {
    const cards: MetricId[] = ["net_sales", "orders", "aov"];
    expect(moveCard(cards, "orders", -1)).toEqual(["orders", "net_sales", "aov"]);
    expect(moveCard(cards, "net_sales", -1)).toEqual(cards);
    expect(moveCard(cards, "aov", 1)).toEqual(cards);
  });
});

describe("what the Overview asks the server for", () => {
  it("always the totals, trend, top items and mix; profit only for cost holders", () => {
    expect(overviewSections(false)).toEqual(["summary", "periods", "items", "order_types", "payments"]);
    expect(overviewSections(true)).toEqual(["summary", "periods", "items", "order_types", "payments", "profit"]);
  });
});

describe("cardValues", () => {
  it("reads a card from the totals or, for cost figures, from the profit section", () => {
    const values = cardValues(
      { ok: true, data: { days: 3, values: { net_sales: 100 }, previous: { net_sales: 80 } } },
      { ok: true, data: { values: { gross_margin_pct: 0.6 }, previous: null, ingredientBasis: "recipes", findings: [] } },
    );
    expect(values.current).toEqual({ net_sales: 100, gross_margin_pct: 0.6 });
    expect(values.previous).toEqual({ net_sales: 80 });
  });
});
