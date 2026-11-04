import { buildExpenseCsv, expenseCsvFileName, EXPENSE_CSV_HEADERS } from "./expenses-home-csv";
import { HOME_CATEGORIES, homeExpense, homeQueued } from "./expenses-home-fixtures";
import { needsYouItems } from "./expenses-home-needs";
import { buildHomeRows, spentThrough, type BuildRowsInput } from "./expenses-home-rows";
import type { ExpenseFlag } from "./types";

const OCTOBER = { from: "2026-10-01", to: "2026-10-31" };

function rowsOf(overrides: Partial<BuildRowsInput>) {
  return buildHomeRows({
    expenses: [],
    queued: [],
    categories: HOME_CATEGORIES,
    flagsById: {},
    waitingReceipts: new Set(),
    window: OCTOBER,
    ...overrides,
  });
}

describe("needsYouItems", () => {
  test("says nothing when nothing needs the owner", () => {
    // Arrange
    const rows = rowsOf({ expenses: [homeExpense({ id: "a" })] });

    // Act
    const items = needsYouItems({ rows, unsortedCount: 0, unsortedCents: 0 });

    // Assert
    expect(items).toEqual([]);
  });

  test("asks for a category for old drawer pay-outs, with their total", () => {
    const items = needsYouItems({ rows: [], unsortedCount: 3, unsortedCents: 82_000 });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: "unsorted",
      title: "3 drawer pay-outs need a category",
      detail: "From older app versions · ₱820",
      action: { kind: "sort" },
    });
  });

  test("points at big expenses without a receipt", () => {
    const flags: Record<string, ExpenseFlag[]> = { a: ["no_receipt"], b: ["no_receipt"] };
    const rows = rowsOf({ expenses: [homeExpense({ id: "a" }), homeExpense({ id: "b" })], flagsById: flags });

    const [item] = needsYouItems({ rows, unsortedCount: 0, unsortedCents: 0 });

    expect(item).toMatchObject({
      key: "no_receipt",
      title: "2 big expenses have no receipt",
      detail: "₱1,000 or more each",
      action: { kind: "view", view: "no_receipt" },
    });
  });

  test("points at possible doubles", () => {
    const flags: Record<string, ExpenseFlag[]> = { a: ["possible_duplicate"] };
    const rows = rowsOf({ expenses: [homeExpense({ id: "a" })], flagsById: flags });

    const [item] = needsYouItems({ rows, unsortedCount: 0, unsortedCents: 0 });

    expect(item).toMatchObject({ key: "duplicate", title: "1 expense may be entered twice", action: { kind: "view", view: "check" } });
  });

  test("says when entries on this phone were refused, before saying any are waiting", () => {
    const rows = rowsOf({ queued: [homeQueued({ id: "q1" }), homeQueued({ id: "q2", refusedReason: "Removed category" })] });

    const [item] = needsYouItems({ rows, unsortedCount: 0, unsortedCents: 0 });

    expect(item).toMatchObject({ key: "phone", tone: "danger", title: "1 expense was not sent" });
  });

  test("says entries are waiting to send when none were refused", () => {
    const rows = rowsOf({ queued: [homeQueued({ id: "q1" }), homeQueued({ id: "q2" })] });

    const [item] = needsYouItems({ rows, unsortedCount: 0, unsortedCents: 0 });

    expect(item).toMatchObject({ key: "phone", tone: "info", title: "2 waiting to send" });
  });

  test("ignores a voided row's flags", () => {
    const rows = rowsOf({ expenses: [homeExpense({ id: "a", status: "void" })], flagsById: { a: ["no_receipt"] } });

    expect(needsYouItems({ rows, unsortedCount: 0, unsortedCents: 0 })).toEqual([]);
  });
});

describe("spentThrough", () => {
  test("adds up spending up to and including a day", () => {
    const rows = rowsOf({
      expenses: [
        homeExpense({ id: "a", spentOn: "2026-10-05", amountCents: 1_000 }),
        homeExpense({ id: "b", spentOn: "2026-10-06", amountCents: 2_000 }),
      ],
    });

    expect(spentThrough(rows, "2026-10-05")).toBe(1_000);
    expect(spentThrough(rows, null)).toBe(3_000);
  });
});

describe("buildExpenseCsv", () => {
  const expenses = [
    homeExpense({ id: "b", spentOn: "2026-10-05", createdAt: "2026-10-05T02:00:00Z", categoryId: "rent", amountCents: 1_500_050, paidFrom: "bank", paidToName: "Landlord", receiptCount: 2 }),
    homeExpense({ id: "a", spentOn: "2026-10-02", note: "=SUM(A1)", amountCents: 105_000, paidFrom: "drawer", createdByName: "Ben" }),
    homeExpense({ id: "v", spentOn: "2026-10-03", status: "void", amountCents: 500 }),
    homeExpense({ id: "x", spentOn: "2026-09-30", amountCents: 999 }),
  ];

  test("writes the window's rows oldest first with every column the owner reads", () => {
    // Act
    const { csv } = buildExpenseCsv(expenses, HOME_CATEGORIES, OCTOBER);
    const lines = csv.replace("﻿", "").split("\r\n");

    // Assert
    expect(lines[0]).toBe(EXPENSE_CSV_HEADERS.join(","));
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe("2026-10-02,Gas / LPG,'=SUM(A1),,Drawer,1050,Ben,Recorded,0");
    expect(lines[2]).toBe("2026-10-03,Gas / LPG,,,Cash on hand,5,Owner,Voided,0");
    expect(lines[3]).toBe("2026-10-05,Rent (Upa),,Landlord,Bank,15000.5,Owner,Recorded,2");
  });

  test("names the file by its days", () => {
    expect(expenseCsvFileName(OCTOBER)).toBe("expenses_2026-10-01_2026-10-31.csv");
  });
});

describe("Make it a bill? in Needs you", () => {
  const kuryente = { categoryId: "cat-power", name: "Kuryente", typicalDay: 24, typicalCents: 620_000, monthNames: ["August", "September"] };

  test("asks once, in plain words, with a way to put it off", () => {
    // Act
    const items = needsYouItems({ rows: [], unsortedCount: 0, unsortedCents: 0, billSuggestion: kuryente });

    // Assert
    expect(items).toEqual([
      {
        key: "make_bill",
        icon: "calendar",
        tone: "accent",
        title: "Kuryente comes every month",
        detail: "You paid it around the 24th in August and September. Want a reminder?",
        cta: "Make it a bill",
        dismissLabel: "Not now",
        action: { kind: "make_bill", categoryId: "cat-power", typicalDay: 24, typicalCents: 620_000, name: "Kuryente" },
      },
    ]);
  });

  test("comes after everything the owner must fix", () => {
    const items = needsYouItems({ rows: [], unsortedCount: 2, unsortedCents: 10_000, billSuggestion: kuryente });
    expect(items.map((item) => item.key)).toEqual(["unsorted", "make_bill"]);
  });

  test("three months read as a list", () => {
    const [item] = needsYouItems({
      rows: [],
      unsortedCount: 0,
      unsortedCents: 0,
      billSuggestion: { ...kuryente, typicalDay: 1, monthNames: ["July", "August", "September"] },
    });
    expect(item.detail).toBe("You paid it around the 1st in July, August and September. Want a reminder?");
  });
});
