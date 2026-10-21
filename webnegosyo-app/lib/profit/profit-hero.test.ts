import { fallingBars, heroEyebrow, heroSentence } from "./profit-hero";
import { reportWith } from "./profit-fixtures";
import { resolveProfitWindow } from "./profit-period";

// Wed 2026-10-22 10:00 Manila.
const NOW = Date.parse("2026-10-22T02:00:00.000Z");

const close = (value: number) => Math.round(value * 1000) / 1000;

function geometry(rows: ReturnType<typeof fallingBars>) {
  return rows.map((row) => [row.key, row.tone, close(row.offset), close(row.width)]);
}

describe("the falling bar", () => {
  it("falls from sales through ingredients and expenses to what was kept", () => {
    const rows = fallingBars(reportWith());
    expect(rows.map((row) => [row.label, row.valueText])).toEqual([
      ["Sales", "₱124.6k"],
      ["Ingredients", "−₱40.6k"],
      ["Expenses", "−₱48.2k"],
      ["Kept", "₱35.8k"],
    ]);
    expect(geometry(rows)).toEqual([
      ["sales", "sales", 0, 1],
      ["ingredients", "ingredients", 0, 0.326],
      ["expenses", "expenses", 0.326, 0.387],
      ["kept", "kept", 0.713, 0.287],
    ]);
  });

  it("draws a loss past the end of sales, scaled so nothing leaves the track", () => {
    // ₱10,000 sales, ₱4,000 ingredients, ₱8,000 expenses → ₱2,000 short.
    const rows = fallingBars(
      reportWith({ net_sales_cents: 1_000_000, ingredients_cents: 400_000, staff_cents: 300_000, occupancy_cents: 500_000, utilities_cents: 0 }),
    );
    const kept = rows[3];
    expect([kept.label, kept.tone, kept.valueText]).toEqual(["Lost", "loss", "−₱2,000"]);
    expect(close(rows[0].width)).toBe(close(10 / 12));
    expect(close(kept.offset)).toBe(close(10 / 12));
    expect(close(kept.offset + kept.width)).toBe(1);
  });

  it("never draws NaN with no sales and no costs", () => {
    const rows = fallingBars(reportWith({ net_sales_cents: 0, ingredients_cents: 0, staff_cents: 0, occupancy_cents: 0, utilities_cents: 0 }, []));
    for (const row of rows) {
      expect(Number.isFinite(row.offset)).toBe(true);
      expect(Number.isFinite(row.width)).toBe(true);
      expect(row.width).toBe(0);
    }
  });

  it("keeps every segment inside the track when costs come back negative", () => {
    // A stock count that found more than expected can make ingredients negative.
    const rows = fallingBars(reportWith({ sale_movements: 2, count_variance_cents: -50_000, ingredients_cents: 0 }));
    for (const row of rows) {
      expect(row.offset).toBeGreaterThanOrEqual(0);
      expect(row.width).toBeGreaterThanOrEqual(0);
      expect(row.offset + row.width).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("the hero's words", () => {
  const month = resolveProfitWindow({ preset: "this_month" }, NOW);

  it("names the period, and says so far only while it runs", () => {
    expect(heroEyebrow(month, false)).toBe("Kept in October so far");
    expect(heroEyebrow(resolveProfitWindow({ preset: "last_month" }, NOW), false)).toBe("Kept in September");
    expect(heroEyebrow(resolveProfitWindow({ preset: "this_week" }, NOW), false)).toBe("Kept this week so far");
    expect(heroEyebrow(resolveProfitWindow({ preset: "custom", fromKey: "2026-10-01", toKey: "2026-10-15" }, NOW), false)).toBe(
      "Kept Oct 1 – Oct 15",
    );
    expect(heroEyebrow(resolveProfitWindow({ preset: "custom", fromKey: "2026-10-03", toKey: "2026-10-03" }, NOW), true)).toBe(
      "Lost on Oct 3",
    );
    expect(heroEyebrow(month, true)).toBe("Lost in October so far");
  });

  it("says what was kept as a share of sales", () => {
    expect(heroSentence(reportWith(), month)).toBe("From ₱124,600 in sales you kept 29%.");
  });

  it("says a loss plainly", () => {
    const report = reportWith({ net_sales_cents: 1_000_000, ingredients_cents: 400_000, staff_cents: 300_000, occupancy_cents: 500_000, utilities_cents: 0 });
    expect(heroSentence(report, month)).toBe("You spent ₱2,000 more than the ₱10,000 you made in sales.");
  });

  it("says there were no sales, with what went out", () => {
    expect(heroSentence(reportWith({ net_sales_cents: 0 }), month)).toBe("No sales yet this month. ₱88,800 went out.");
    const last = resolveProfitWindow({ preset: "last_month" }, NOW);
    expect(heroSentence(reportWith({ net_sales_cents: 0, ingredients_cents: 0, staff_cents: 0, occupancy_cents: 0, utilities_cents: 0 }, []), last)).toBe(
      "No sales or costs last month.",
    );
  });
});
