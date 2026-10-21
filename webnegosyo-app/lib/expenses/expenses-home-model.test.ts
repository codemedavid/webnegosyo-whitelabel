import { HOME_CATEGORIES, HOME_NOW, homeExpense, homeQueued } from "./expenses-home-fixtures";
import { buildHomeModel, type HomeModelInput } from "./expenses-home-model";
import { NO_HOME_FILTERS } from "./expenses-home-rows";

function model(overrides: Partial<HomeModelInput>) {
  return buildHomeModel({
    month: "2026-10",
    range: null,
    filters: NO_HOME_FILTERS,
    expenses: [],
    previous: null,
    categories: HOME_CATEGORIES,
    queued: [],
    waitingReceipts: new Set(),
    unsortedCount: 0,
    unsortedCents: 0,
    nowMs: HOME_NOW,
    ...overrides,
  });
}

const october = [
  homeExpense({ id: "a", spentOn: "2026-10-22", amountCents: 110_000, paidFrom: "drawer" }),
  homeExpense({ id: "b", spentOn: "2026-10-02", categoryId: "rent", amountCents: 1_000_000 }),
];
const september = [
  homeExpense({ id: "p1", spentOn: "2026-09-02", categoryId: "rent", amountCents: 900_000 }),
  homeExpense({ id: "p2", spentOn: "2026-09-21", amountCents: 100_000, paidFrom: "drawer" }),
  homeExpense({ id: "p3", spentOn: "2026-09-28", amountCents: 500_000 }),
];

describe("buildHomeModel", () => {
  test("compares this month so far with the same days of last month", () => {
    // Act
    const result = model({ expenses: october, previous: september });

    // Assert: 1,110,000 vs 1,000,000 (Sep 1–22) = up 11%
    expect(result.totals.spentCents).toBe(1_110_000);
    expect(result.change).toEqual({ text: "Up 11% vs 1–22 Sep", direction: "up" });
  });

  test("compares the filtered total with the same filter last month", () => {
    const result = model({ expenses: october, previous: september, filters: { ...NO_HOME_FILTERS, view: "drawer" } });

    expect(result.totals.spentCents).toBe(110_000);
    expect(result.change?.text).toBe("Up 10% vs 1–22 Sep");
    expect(result.isFiltered).toBe(true);
    expect(result.eyebrow).toBe("Spent in October · filtered");
  });

  test("says nothing about change while last month is unknown", () => {
    expect(model({ expenses: october }).change).toBeNull();
  });

  test("shows today's line only for the current month", () => {
    expect(model({ expenses: october }).today).toEqual({ cents: 110_000, count: 1 });
    expect(model({ month: "2026-09", expenses: september }).today).toBeNull();
  });

  test("a Profit range filters the book to its days and has no change pill", () => {
    const result = model({ expenses: october, previous: september, range: { from: "2026-10-20", to: "2026-10-26" } });

    expect(result.window).toEqual({ from: "2026-10-20", to: "2026-10-26" });
    expect(result.totals.spentCents).toBe(110_000);
    expect(result.change).toBeNull();
    expect(result.eyebrow).toBe("Spent 20–26 Oct");
    expect(result.today).toBeNull();
  });

  test("the by-category view ignores the category filter so another can be picked", () => {
    const result = model({ expenses: october, filters: { ...NO_HOME_FILTERS, categoryId: "rent" } });

    expect(result.days.flatMap((day) => day.rows).map((row) => row.expenseId)).toEqual(["b"]);
    expect(result.breakdown.map((line) => line.categoryId)).toEqual(["rent", "lpg"]);
  });

  test("lists what needs the owner from the whole month, whatever the filter", () => {
    const result = model({
      expenses: october,
      queued: [homeQueued({ id: "q1" })],
      unsortedCount: 1,
      unsortedCents: 5_000,
      filters: { ...NO_HOME_FILTERS, view: "drawer" },
    });

    expect(result.needs.map((item) => item.key)).toEqual(["unsorted", "no_receipt", "phone"]);
    expect(result.counts.check).toBe(1);
  });
});
