import { expenseHistory } from "./expense-history";
import type { ExpenseDetail } from "./expense-service";
import type { Expense } from "./types";

const NOW = Date.parse("2026-10-21T04:00:00Z");

const base: Expense = {
  id: "e2", tenantId: "t1", outletId: null, categoryId: "c", supplierId: null, paidToName: null, staffUserId: null,
  note: null, amountCents: 125_000, spentOn: "2026-10-21", paidFrom: "drawer", shiftCashMovementId: "m1",
  isStockPurchase: false, status: "recorded", voidReason: null, voidedBy: null, voidedAt: null,
  replacesExpenseId: "e1", clientRequestId: null, createdBy: null, createdByName: "Ana",
  createdAt: "2026-10-21T01:42:00Z", receiptCount: 0, docType: null, invoiceNo: null, supplierTin: null,
  vatCents: null, ewtCents: null, ewtRate: null, form2307Given: false,
};

describe("expenseHistory", () => {
  it("tells a fix chain oldest first, in words", () => {
    const detail: ExpenseDetail = {
      expense: { ...base, status: "void", voidReason: "wrong category", voidedAt: "2026-10-21T03:00:00Z" },
      receipts: [],
      replaces: { ...base, id: "e1", voidReason: "wrong amount", voidedAt: "2026-10-21T01:50:00Z" },
      replacedBy: { ...base, id: "e3", createdAt: "2026-10-21T03:00:00Z" },
      drawer: { shiftId: "s1", drawerName: "Cashier 1", isShiftOpen: true },
    };
    expect(expenseHistory(detail, NOW)).toEqual([
      { key: "replaces", text: "Fixes an earlier entry (wrong amount)", when: "Today · 9:50 AM", linkExpenseId: "e1" },
      { key: "recorded", text: "Recorded by Ana from the Cashier 1 drawer", when: "Today · 9:42 AM", linkExpenseId: null },
      { key: "voided", text: "Voided: wrong category", when: "Today · 11:00 AM", linkExpenseId: null },
      { key: "replacedBy", text: "Replaced by a corrected entry", when: "Today · 11:00 AM", linkExpenseId: "e3" },
    ]);
  });

  it("names the source of a book expense", () => {
    const detail: ExpenseDetail = { expense: { ...base, paidFrom: "gcash", replacesExpenseId: null }, receipts: [], replaces: null, replacedBy: null, drawer: null };
    expect(expenseHistory(detail, NOW).map((line) => line.text)).toEqual(["Recorded by Ana from GCash"]);
  });

  it("writes an older day the way the rest of the app does: weekday, day, month", () => {
    // Arrange
    const detail: ExpenseDetail = {
      expense: { ...base, replacesExpenseId: null, createdAt: "2026-10-19T01:42:00Z", spentOn: "2026-10-19" },
      receipts: [],
      replaces: null,
      replacedBy: null,
      drawer: null,
    };

    // Act
    const [recorded] = expenseHistory(detail, NOW);

    // Assert
    expect(recorded.when).toBe("Mon, 19 Oct · 9:42 AM");
  });
});
