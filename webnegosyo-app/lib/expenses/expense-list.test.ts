import { NO_FILTERS, buildExpenseSections, categoryFilterChoices, monthSpentCents } from "./expense-list";
import type { QueuedExpense } from "./expense-queue";
import type { Expense, ExpenseCategory } from "./types";

const NOW = Date.parse("2026-10-21T04:00:00Z"); // 12:00 PM in Manila

function category(id: string, name: string, icon: string, group: ExpenseCategory["group"]): ExpenseCategory {
  return { id, tenantId: "t1", systemKey: id, name, icon, group, needsNote: false, sortOrder: 0, archivedAt: null };
}

const categories = [
  category("lpg", "Gas / LPG", "LP", "utilities"),
  category("ice", "Ice (Yelo)", "IC", "ingredients"),
  category("rent", "Rent (Upa)", "RE", "occupancy"),
  category("owner", "Owner took cash", "OW", "not_expense"),
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
    amountCents: 100,
    spentOn: "2026-10-21",
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
    createdAt: "2026-10-21T00:00:00Z",
    receiptCount: 0,
    billId: null,
    billDueOn: null,
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

const expenses = [
  expense({ id: "a", categoryId: "lpg", amountCents: 125_000, paidFrom: "drawer", createdByName: "Ana", createdAt: "2026-10-21T01:42:00Z" }),
  expense({ id: "b", categoryId: "ice", amountCents: 12_000, paidFrom: "drawer", createdByName: "Ana", createdAt: "2026-10-21T00:10:00Z", receiptCount: 1 }),
  expense({ id: "c", categoryId: "rent", amountCents: 1_500_000, paidFrom: "bank", spentOn: "2026-10-19", createdAt: "2026-10-19T02:00:00Z" }),
  expense({ id: "d", categoryId: "lpg", amountCents: 50_000, spentOn: "2026-10-19", status: "void", voidReason: "wrong category" }),
  expense({ id: "e", categoryId: "owner", amountCents: 200_000, paidFrom: "drawer", spentOn: "2026-10-19" }),
];

const queued: QueuedExpense = {
  id: "req-q",
  tenantId: "t1",
  categoryName: "Ice (Yelo)",
  attempts: 1,
  retryAt: null,
  createdAt: NOW,
  refusedReason: null,
  payload: {
    kind: "book",
    createdByName: "Owner",
    draft: { amountCents: 8_000, categoryId: "ice", spentOn: "2026-10-21", paidFrom: "cash", outletId: null, note: "Pamasahe", clientRequestId: "req-q" },
  },
};

const base = {
  expenses,
  queued: [queued],
  categories,
  flagsById: {},
  waitingReceipts: new Set<string>(),
  filters: NO_FILTERS,
  month: "2026-10",
  now: NOW,
};

describe("buildExpenseSections", () => {
  it("groups by day, newest first, with day totals that leave out voids and cash taken out", () => {
    const sections = buildExpenseSections(base);

    expect(sections.map((s) => [s.title, s.totalCents])).toEqual([
      ["Today", 145_000],
      ["Mon, 19 Oct", 1_500_000],
    ]);
    // The waiting row sits on top of its day and does not count until it lands.
    expect(sections[0].rows.map((r) => r.key)).toEqual(["queued:req-q", "a", "b"]);
  });

  it("writes rows the way the list reads them", () => {
    const [today, older] = buildExpenseSections(base);
    expect(today.rows[1]).toMatchObject({
      title: "Gas / LPG",
      meta: "Drawer · Ana · 9:42 AM",
      icon: "LP",
      isDrawer: true,
      amountCents: 125_000,
    });
    expect(today.rows[2].hasReceipt).toBe(true);
    expect(today.rows[0]).toMatchObject({ title: "Pamasahe", meta: "Cash on hand · Owner · Waiting to sync", isWaiting: true });
    expect(older.rows.find((r) => r.key === "d")).toMatchObject({ isVoid: true, meta: "Voided · wrong category" });
    expect(older.rows.find((r) => r.key === "e")).toMatchObject({ isNotExpense: true });
  });

  it("hides a queued row once its expense has landed", () => {
    const landed = expense({ id: "z", clientRequestId: "req-q", categoryId: "ice", amountCents: 8_000 });
    const sections = buildExpenseSections({ ...base, expenses: [...expenses, landed] });
    expect(sections[0].rows.some((r) => r.queuedId === "req-q")).toBe(false);
  });

  it("filters by category, by source and by needs-a-look", () => {
    const byCategory = buildExpenseSections({ ...base, filters: { ...NO_FILTERS, categoryId: "lpg" } });
    expect(byCategory.flatMap((s) => s.rows.map((r) => r.key))).toEqual(["a", "d"]);

    const bySource = buildExpenseSections({ ...base, filters: { ...NO_FILTERS, paidFrom: "bank" } });
    expect(bySource.flatMap((s) => s.rows.map((r) => r.key))).toEqual(["c"]);

    const flagged = buildExpenseSections({
      ...base,
      flagsById: { c: ["no_receipt"], d: ["round_other"] },
      filters: { ...NO_FILTERS, needsLook: true },
    });
    // A voided row never needs a look.
    expect(flagged.flatMap((s) => s.rows.map((r) => r.key))).toEqual(["c"]);
  });

  it("shows a refused entry as not saved, and as needing a look", () => {
    const refused = { ...queued, refusedReason: "This drawer is already closed. Open a drawer first." };
    const [today] = buildExpenseSections({ ...base, queued: [refused], filters: { ...NO_FILTERS, needsLook: true } });
    expect(today.rows[0]).toMatchObject({ isWaiting: false, meta: "Not saved · This drawer is already closed. Open a drawer first." });
  });
});

describe("month figures", () => {
  it("counts what was spent, apart from cash merely taken out", () => {
    expect(monthSpentCents(expenses, categories)).toEqual({ spentCents: 1_637_000, takenOutCents: 200_000, count: 4 });
  });

  it("offers only this month's categories as filters, biggest first", () => {
    expect(categoryFilterChoices(expenses, categories)).toEqual([
      { id: "rent", label: "Rent" },
      { id: "owner", label: "Owner took cash" },
      { id: "lpg", label: "Gas / LPG" },
      { id: "ice", label: "Ice" },
    ]);
  });
});
