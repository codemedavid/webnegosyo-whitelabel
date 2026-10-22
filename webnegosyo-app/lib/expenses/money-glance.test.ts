import type { TabVisibilityContext } from "../tab-visibility";
import {
  deliveryExpensePrefill,
  moneyAccess,
  keptRow,
  monthSpentDetail,
  profitRowDetail,
  queuedSpends,
  spentOn,
  spentTodayRow,
  unsortedRow,
} from "./money-glance";
import type { QueuedExpense } from "./expense-queue";
import type { Expense, ExpenseCategory } from "./types";

function category(id: string, name: string, group: ExpenseCategory["group"]): ExpenseCategory {
  return { id, tenantId: "t1", systemKey: id, name, icon: null, group, needsNote: false, sortOrder: 0, archivedAt: null };
}

const categories = [
  category("lpg", "Gas / LPG", "utilities"),
  category("ice", "Ice (Yelo)", "ingredients"),
  category("owner", "Owner took cash", "not_expense"),
];

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: "e",
    tenantId: "t1",
    outletId: null,
    categoryId: "lpg",
    supplierId: null,
    paidToName: null,
    staffUserId: null,
    note: null,
    amountCents: 100_00,
    spentOn: "2026-10-22",
    paidFrom: "cash",
    shiftCashMovementId: null,
    isStockPurchase: false,
    status: "recorded",
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    replacesExpenseId: null,
    clientRequestId: null,
    createdBy: null,
    createdByName: "Owner",
    createdAt: "2026-10-22T02:00:00Z",
    receiptCount: 0,
    docType: null,
    invoiceNo: null,
    supplierTin: null,
    vatCents: null,
    ewtCents: null,
    ewtRate: null,
    form2307Given: false,
    ...overrides,
  };
}

describe("spentOn", () => {
  it("adds up one Manila day's spending, with how many came from the drawer", () => {
    // Arrange
    const rows = [
      expense({ id: "a", amountCents: 1_180_00, paidFrom: "drawer" }),
      expense({ id: "b", categoryId: "ice", amountCents: 150_00, paidFrom: "drawer" }),
      expense({ id: "c", amountCents: 2_150_00 }),
      expense({ id: "d", spentOn: "2026-10-21", amountCents: 999_00 }),
    ];

    // Act
    const glance = spentOn(rows, categories, "2026-10-22", null);

    // Assert
    expect(glance).toEqual({ cents: 3_480_00, count: 3, drawerCount: 2 });
  });

  it("leaves out voided rows and cash merely moved, like the month figure", () => {
    const rows = [
      expense({ id: "a", amountCents: 500_00 }),
      expense({ id: "b", amountCents: 300_00, status: "void" }),
      expense({ id: "c", categoryId: "owner", amountCents: 2_000_00, paidFrom: "drawer" }),
    ];

    expect(spentOn(rows, categories, "2026-10-22", null)).toEqual({ cents: 500_00, count: 1, drawerCount: 0 });
  });

  it("files a row whose category is unknown as spending, never dropping it", () => {
    const rows = [expense({ id: "a", categoryId: "gone", amountCents: 75_00 })];

    expect(spentOn(rows, categories, "2026-10-22", null)).toEqual({ cents: 75_00, count: 1, drawerCount: 0 });
  });

  it("counts only the viewed branch's rows when a branch is chosen, and every branch when none is", () => {
    // Arrange
    const rows = [
      expense({ id: "a", outletId: "makati", amountCents: 400_00 }),
      expense({ id: "b", outletId: "bgc", amountCents: 250_00, paidFrom: "drawer" }),
      expense({ id: "c", outletId: null, amountCents: 100_00 }),
    ];

    // Act
    const makati = spentOn(rows, categories, "2026-10-22", "makati");
    const all = spentOn(rows, categories, "2026-10-22", null);

    // Assert
    expect(makati).toEqual({ cents: 400_00, count: 1, drawerCount: 0 });
    expect(all).toEqual({ cents: 750_00, count: 3, drawerCount: 1 });
  });
});

describe("spending still on this phone", () => {
  function queued(id: string, overrides: Partial<QueuedExpense> & { amountCents?: number; spentOn?: string; outletId?: string | null } = {}): QueuedExpense {
    const { amountCents = 200_00, spentOn: day = "2026-10-22", outletId = null, ...rest } = overrides;
    return {
      id,
      tenantId: "t1",
      payload: {
        kind: "book",
        draft: { amountCents, categoryId: "lpg", spentOn: day, paidFrom: "cash", outletId, clientRequestId: id },
        createdByName: "Owner",
      },
      categoryName: "Gas / LPG",
      attempts: 0,
      retryAt: null,
      createdAt: Date.parse("2026-10-22T02:00:00Z"),
      refusedReason: null,
      ...rest,
    };
  }

  function drawerQueued(id: string, amountCents: number): QueuedExpense {
    return {
      ...queued(id),
      payload: { kind: "drawer", input: { shiftId: "s1", amountCents, categoryId: "ice", clientRequestId: id, recordedByName: "Ana" } },
    };
  }

  it("counts today's unsent entries, but not refused ones or ones that already landed", () => {
    // Arrange
    const landed = [expense({ id: "a", amountCents: 100_00, clientRequestId: "q-landed" })];
    const entries = [
      queued("q-new", { amountCents: 300_00 }),
      queued("q-landed", { amountCents: 100_00 }),
      queued("q-refused", { amountCents: 999_00, refusedReason: "Category archived" }),
      queued("q-yesterday", { amountCents: 50_00, spentOn: "2026-10-21" }),
    ];

    // Act
    const glance = spentOn(landed, categories, "2026-10-22", null, queuedSpends(entries));

    // Assert
    expect(glance).toEqual({ cents: 400_00, count: 2, drawerCount: 0 });
  });

  it("dates a queued drawer pay-out by when it was typed and counts it as from the drawer", () => {
    const glance = spentOn([], categories, "2026-10-22", null, queuedSpends([drawerQueued("d1", 150_00)]));

    expect(glance).toEqual({ cents: 150_00, count: 1, drawerCount: 1 });
  });

  it("keeps a queued book entry to its branch, and counts this phone's drawer pay-out in any branch view", () => {
    const entries = queuedSpends([queued("q-bgc", { outletId: "bgc" }), drawerQueued("d1", 150_00)]);

    expect(spentOn([], categories, "2026-10-22", "makati", entries)).toEqual({ cents: 150_00, count: 1, drawerCount: 1 });
  });
});

describe("spentTodayRow", () => {
  it("states the day's spending and where it came from", () => {
    expect(spentTodayRow({ cents: 3_480_00, count: 6, drawerCount: 2 })).toEqual({
      title: "Spent today ₱3,480",
      detail: "6 expenses · 2 from the drawer",
    });
  });

  it("drops the drawer part when nothing left the drawer, and speaks in the singular", () => {
    expect(spentTodayRow({ cents: 1_050_50, count: 1, drawerCount: 0 })).toEqual({
      title: "Spent today ₱1,050.50",
      detail: "1 expense",
    });
  });

  it("says so plainly on a day with nothing recorded", () => {
    expect(spentTodayRow({ cents: 0, count: 0, drawerCount: 0 })).toEqual({
      title: "Spent today ₱0",
      detail: "Nothing recorded yet today",
    });
  });
});

describe("monthSpentDetail", () => {
  it("names the month in words", () => {
    expect(monthSpentDetail(48_230_00, "October")).toBe("₱48,230 spent in October");
  });
});

describe("keptRow and profitRowDetail", () => {
  it("says what was kept this month and its share of sales", () => {
    const report = { profitCents: 35_800_00, ratios: { profit: 0.29 } };

    expect(keptRow(report)).toEqual({ title: "Kept this month ₱35,800", detail: "29% of sales · Profit", isLoss: false });
    expect(profitRowDetail(report)).toBe("Kept ₱35,800 · 29%");
  });

  it("says nothing about a share when there were no sales", () => {
    const report = { profitCents: 0, ratios: { profit: null } };

    expect(keptRow(report)).toEqual({ title: "Kept this month ₱0", detail: "Profit", isLoss: false });
    expect(profitRowDetail(report)).toBe("Kept ₱0");
  });

  it("calls a loss a loss, without a minus on the headline", () => {
    const report = { profitCents: -3_200_00, ratios: { profit: -0.04 } };

    expect(keptRow(report)).toEqual({ title: "Lost this month ₱3,200", detail: "More went out than came in · Profit", isLoss: true });
    expect(profitRowDetail(report)).toBe("Lost ₱3,200 this month");
  });
});

describe("unsortedRow", () => {
  it("asks for categories only when pay-outs are waiting for one", () => {
    expect(unsortedRow(0)).toBeNull();
    expect(unsortedRow(1)).toEqual({ title: "1 pay-out needs a category", detail: "Give these a category" });
    expect(unsortedRow(3)).toEqual({ title: "3 pay-outs need a category", detail: "Give these a category" });
  });
});

describe("deliveryExpensePrefill", () => {
  it("pre-fills what a delivery cost when a unit cost was typed", () => {
    expect(
      deliveryExpensePrefill({ reason: "receive", quantity: 12.5, unitCost: 48.2, itemName: "Chicken thigh" }),
    ).toEqual({ amountCents: 602_50, note: "Chicken thigh delivery" });
  });

  it("leaves the amount to the owner when no cost was typed", () => {
    expect(deliveryExpensePrefill({ reason: "receive", quantity: 3, unitCost: null, itemName: "Rice" })).toEqual({
      amountCents: undefined,
      note: "Rice delivery",
    });
  });

  it("only asks after a delivery, never after a count or waste", () => {
    expect(deliveryExpensePrefill({ reason: "stocktake", quantity: 3, unitCost: null, itemName: "Rice" })).toBeNull();
    expect(deliveryExpensePrefill({ reason: "waste", quantity: 1, unitCost: 10, itemName: "Rice" })).toBeNull();
  });

  it("never pre-fills a nonsense amount", () => {
    expect(deliveryExpensePrefill({ reason: "receive", quantity: 2, unitCost: 0, itemName: "Ice" })?.amountCents).toBeUndefined();
    expect(deliveryExpensePrefill({ reason: "receive", quantity: Number.NaN, unitCost: 5, itemName: "Ice" })?.amountCents).toBeUndefined();
  });
});

describe("moneyAccess", () => {
  function ctx(permissions: string[] | null, isOwner = false): TabVisibilityContext {
    return {
      caller: { role: "admin", isOwner, permissions },
      audience: { accountScope: { kind: "all" }, activeOutletCount: 1, isDemo: false },
      takesAdvanceOrders: false,
    };
  }

  it("gives an owner every money row, and Kept only on the platform backend", () => {
    expect(moneyAccess(ctx(null, true), "platform")).toEqual({ canSeeExpenses: true, canSeeProfitRow: true, canSeeKept: true });
    expect(moneyAccess(ctx(null, true), "convex").canSeeKept).toBe(false);
  });

  it("hides Profit from a reports-only manager, who would meet a locked screen", () => {
    expect(moneyAccess(ctx(["reports"]), "platform")).toEqual({ canSeeExpenses: false, canSeeProfitRow: false, canSeeKept: false });
    expect(moneyAccess(ctx(["reports", "expenses"]), "platform")).toEqual({
      canSeeExpenses: true,
      canSeeProfitRow: false,
      canSeeKept: false,
    });
  });

  it("shows Profit once the account also holds costs", () => {
    expect(moneyAccess(ctx(["reports", "expenses", "costs"]), "platform").canSeeKept).toBe(true);
  });

  it("shows a cashier no money rows", () => {
    expect(moneyAccess(ctx(["pos"]), "platform")).toEqual({ canSeeExpenses: false, canSeeProfitRow: false, canSeeKept: false });
  });
});
