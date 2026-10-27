import {
  NO_HOME_FILTERS,
  ROW_NOTE_TEXT,
  buildHomeRows,
  categoryBreakdown,
  countedCents,
  dayTitle,
  filterRows,
  groupByDay,
  homeTotals,
  isFiltered,
  knownCategoryFilters,
  todaySummary,
  viewCounts,
  wholePercents,
  type BuildRowsInput,
} from "./expenses-home-rows";
import { HOME_CATEGORIES, HOME_NOW, homeExpense, homeQueued } from "./expenses-home-fixtures";
import type { Expense, ExpenseFlag } from "./types";

const OCTOBER = { from: "2026-10-01", to: "2026-10-31" };

function input(overrides: Partial<BuildRowsInput>): BuildRowsInput {
  return {
    expenses: [],
    queued: [],
    categories: HOME_CATEGORIES,
    flagsById: {},
    waitingReceipts: new Set(),
    window: OCTOBER,
    ...overrides,
  };
}

const book: Expense[] = [
  homeExpense({ id: "lpg", categoryId: "lpg", note: "LPG 11kg", amountCents: 118_000, paidFrom: "drawer", createdByName: "Ben", createdAt: "2026-10-22T02:12:00Z" }),
  homeExpense({ id: "ice", categoryId: "ice", amountCents: 15_000, paidFrom: "drawer", createdByName: "Ben", createdAt: "2026-10-22T03:30:00Z" }),
  homeExpense({ id: "market", categoryId: "palengke", note: "Palengke run", amountCents: 215_000, paidToName: "Aling Nena", createdByName: "Ana", spentOn: "2026-10-21", createdAt: "2026-10-20T22:40:00Z", receiptCount: 1 }),
  homeExpense({ id: "rent", categoryId: "rent", amountCents: 1_500_000, paidFrom: "bank", spentOn: "2026-10-19", createdAt: "2026-10-19T02:00:00Z" }),
  homeExpense({ id: "void", categoryId: "lpg", amountCents: 50_000, spentOn: "2026-10-19", status: "void", voidReason: "typo", createdAt: "2026-10-19T01:00:00Z" }),
  homeExpense({ id: "draw", categoryId: "owner_draw", amountCents: 200_000, paidFrom: "drawer", spentOn: "2026-10-19", createdAt: "2026-10-19T00:30:00Z" }),
];

const flags: Record<string, ExpenseFlag[]> = { lpg: ["no_receipt"], rent: ["possible_duplicate"] };

describe("buildHomeRows", () => {
  test("titles a row by its note, else by its category", () => {
    // Arrange
    const rows = buildHomeRows(input({ expenses: book }));

    // Act
    const byId = new Map(rows.map((row) => [row.expenseId, row]));

    // Assert
    expect(byId.get("lpg")?.title).toBe("LPG 11kg");
    expect(byId.get("ice")?.title).toBe("Ice (Yelo)");
  });

  test("writes the meta as category · paid from · who · time, dropping the category when it is the title", () => {
    const rows = buildHomeRows(input({ expenses: book }));
    const byId = new Map(rows.map((row) => [row.expenseId, row]));

    expect(byId.get("lpg")?.meta).toBe("Gas / LPG · Drawer · Ben · 10:12 AM");
    expect(byId.get("ice")?.meta).toBe("Drawer · Ben · 11:30 AM");
  });

  test("puts the newest day first and the newest row first within a day", () => {
    const rows = buildHomeRows(input({ expenses: book }));

    expect(rows.map((row) => row.expenseId)).toEqual(["ice", "lpg", "market", "rent", "void", "draw"]);
  });

  test("marks a row with no receipt, a voided row and cash merely moved", () => {
    const rows = buildHomeRows(input({ expenses: book, flagsById: flags }));
    const byId = new Map(rows.map((row) => [row.expenseId, row]));

    expect(byId.get("lpg")?.note).toBe("no_receipt");
    expect(byId.get("void")?.note).toBe("void");
    expect(byId.get("void")?.status).toBe("void");
    expect(byId.get("draw")?.isCashMoved).toBe(true);
    expect(byId.get("market")?.note).toBeNull();
    expect(ROW_NOTE_TEXT.refused).toBe("Not sent — tap");
  });

  test("shows a phone's waiting entry on top of its day and a refused one as not sent", () => {
    const rows = buildHomeRows(
      input({
        expenses: book,
        queued: [homeQueued({ id: "q1" }), homeQueued({ id: "q2", refusedReason: "Category was removed" })],
      }),
    );

    expect(rows[0].queuedId).toBe("q1");
    expect(rows[0].note).toBe("waiting");
    expect(rows[0].meta).toBe("Cash on hand · Ben · 11:30 AM");
    expect(rows[1].note).toBe("refused");
    expect(rows[1].refusedReason).toBe("Category was removed");
  });

  test("leaves out a phone entry that already reached the book, or falls outside the window", () => {
    const landed = homeExpense({ id: "landed", clientRequestId: "q1" });

    const rows = buildHomeRows(
      input({ expenses: [landed], queued: [homeQueued({ id: "q1" }), homeQueued({ id: "q3", spentOn: "2026-09-30" })] }),
    );

    expect(rows.map((row) => row.key)).toEqual(["landed"]);
  });

  test("leaves out server rows outside a range window", () => {
    const rows = buildHomeRows(input({ expenses: book, window: { from: "2026-10-20", to: "2026-10-26" } }));

    expect(rows.map((row) => row.expenseId).sort()).toEqual(["ice", "lpg", "market"]);
  });

  test("counts recorded and waiting money, never voided, refused or cash moved", () => {
    const rows = buildHomeRows(
      input({ expenses: book, queued: [homeQueued({ id: "q1" }), homeQueued({ id: "q2", refusedReason: "no" })] }),
    );
    const byKey = new Map(rows.map((row) => [row.key, row]));

    expect(countedCents(byKey.get("lpg")!)).toBe(118_000);
    expect(countedCents(byKey.get("queued:q1")!)).toBe(15_000);
    expect(countedCents(byKey.get("queued:q2")!)).toBe(0);
    expect(countedCents(byKey.get("void")!)).toBe(0);
    expect(countedCents(byKey.get("draw")!)).toBe(0);
  });
});

describe("filterRows", () => {
  const rows = buildHomeRows(
    input({ expenses: book, flagsById: flags, queued: [homeQueued({ id: "q2", refusedReason: "no" })] }),
  );

  test("All keeps everything", () => {
    expect(filterRows(rows, NO_HOME_FILTERS)).toHaveLength(rows.length);
    expect(isFiltered(NO_HOME_FILTERS)).toBe(false);
  });

  test("Drawer keeps drawer pay-outs only", () => {
    const kept = filterRows(rows, { ...NO_HOME_FILTERS, view: "drawer" });

    expect(kept.map((row) => row.expenseId).sort()).toEqual(["draw", "ice", "lpg"]);
  });

  test("No receipt keeps the flagged rows only", () => {
    expect(filterRows(rows, { ...NO_HOME_FILTERS, view: "no_receipt" }).map((row) => row.expenseId)).toEqual(["lpg"]);
  });

  test("Check these keeps possible doubles and entries stuck on this phone", () => {
    const kept = filterRows(rows, { ...NO_HOME_FILTERS, view: "check" });

    expect(kept.map((row) => row.key).sort()).toEqual(["queued:q2", "rent"]);
  });

  test("a category filter keeps that category", () => {
    expect(filterRows(rows, { ...NO_HOME_FILTERS, categoryId: "rent" }).map((row) => row.expenseId)).toEqual(["rent"]);
  });

  test("search looks at the note, who was paid and the category name, ignoring case", () => {
    expect(filterRows(rows, { ...NO_HOME_FILTERS, search: "  nena " }).map((row) => row.expenseId)).toEqual(["market"]);
    expect(filterRows(rows, { ...NO_HOME_FILTERS, search: "YELO" }).map((row) => row.key)).toEqual(["queued:q2", "ice"]);
    expect(isFiltered({ ...NO_HOME_FILTERS, search: "x" })).toBe(true);
    expect(isFiltered({ ...NO_HOME_FILTERS, search: "   " })).toBe(false);
  });

  test("view counts follow the whole window, for the pill badges", () => {
    expect(viewCounts(rows)).toEqual({ all: rows.length, drawer: 3, no_receipt: 1, check: 2 });
  });
});

describe("totals", () => {
  test("whole percents always add up to 100", () => {
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholePercents([0, 0])).toEqual([0, 0]);
    expect(wholePercents([2, 1]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  test("the hero total is the money spent, split by group, biggest first", () => {
    const rows = buildHomeRows(input({ expenses: book }));

    const totals = homeTotals(rows);

    expect(totals.spentCents).toBe(118_000 + 15_000 + 215_000 + 1_500_000);
    expect(totals.count).toBe(4);
    expect(totals.cashMovedCents).toBe(200_000);
    expect(totals.split.map((share) => share.group)).toEqual(["occupancy", "ingredients", "utilities"]);
    expect(totals.split.reduce((sum, share) => sum + share.percent, 0)).toBe(100);
    expect(totals.split.reduce((sum, share) => sum + share.cents, 0)).toBe(totals.spentCents);
  });

  test("the total follows the filters", () => {
    const rows = filterRows(buildHomeRows(input({ expenses: book })), { ...NO_HOME_FILTERS, view: "drawer" });

    expect(homeTotals(rows).spentCents).toBe(133_000);
  });

  test("today's line counts today's spending only", () => {
    const rows = buildHomeRows(input({ expenses: book }));

    expect(todaySummary(rows, HOME_NOW)).toEqual({ cents: 133_000, count: 2 });
  });
});

describe("groupByDay", () => {
  test("titles days plainly and totals each day to its rows", () => {
    const rows = buildHomeRows(input({ expenses: book }));

    const days = groupByDay(rows, HOME_NOW);

    expect(days.map((day) => day.title)).toEqual(["Today · Thu, 22 Oct", "Yesterday · Wed, 21 Oct", "Mon, 19 Oct"]);
    expect(days.map((day) => day.totalCents)).toEqual([133_000, 215_000, 1_500_000]);
    expect(days.reduce((sum, day) => sum + day.totalCents, 0)).toBe(homeTotals(rows).spentCents);
  });

  test("names the year of a day from another year", () => {
    expect(dayTitle("2025-12-29", HOME_NOW)).toBe("Mon, 29 Dec 2025");
  });
});

describe("categoryBreakdown", () => {
  test("lists categories by amount with their share and count", () => {
    const extra = homeExpense({ id: "ice2", categoryId: "ice", amountCents: 5_000 });
    const rows = buildHomeRows(input({ expenses: [...book, extra] }));

    const lines = categoryBreakdown(rows);

    expect(lines.map((line) => line.categoryId)).toEqual(["rent", "palengke", "lpg", "ice"]);
    expect(lines.find((line) => line.categoryId === "ice")).toMatchObject({ cents: 20_000, count: 2, group: "ingredients" });
    expect(lines.reduce((sum, line) => sum + line.percent, 0)).toBe(100);
  });

  test("is empty when nothing was spent", () => {
    expect(categoryBreakdown([])).toEqual([]);
  });
});

describe("branch filter on this phone's entries", () => {
  const atMain = homeQueued({ id: "q-main", outletId: "main" });
  const atNorth = homeQueued({ id: "q-north", outletId: "north" });
  const storeWide = homeQueued({ id: "q-store" });

  test("keeps every queued entry when all branches are on screen", () => {
    const rows = buildHomeRows(input({ queued: [atMain, atNorth, storeWide] }));

    expect(rows.map((row) => row.queuedId).sort()).toEqual(["q-main", "q-north", "q-store"]);
  });

  test("keeps only the chosen branch's queued entries, like the book's own read", () => {
    // Arrange
    const rows = buildHomeRows(input({ queued: [atMain, atNorth, storeWide], branchId: "main" }));

    // Assert
    expect(rows.map((row) => row.queuedId)).toEqual(["q-main"]);
  });
});

describe("knownCategoryFilters", () => {
  test("drops a category the store does not have, so no pill reads just 'Category'", () => {
    const filters = { ...NO_HOME_FILTERS, view: "drawer" as const, categoryId: "made-up" };

    expect(knownCategoryFilters(filters, HOME_CATEGORIES)).toEqual({ ...filters, categoryId: null });
  });

  test("keeps a real category and returns the same object", () => {
    const filters = { ...NO_HOME_FILTERS, categoryId: "ice" };

    expect(knownCategoryFilters(filters, HOME_CATEGORIES)).toBe(filters);
  });
});
