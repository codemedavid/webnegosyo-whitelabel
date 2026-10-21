/**
 * Test fixtures for the Expenses home view-model (`expenses-home*.test.ts`).
 * Not imported by the app.
 */

import type { QueuedExpense } from "./expense-queue";
import type { Expense, ExpenseCategory } from "./types";

/** Thu 22 Oct 2026, 12:00 PM in Manila. */
export const HOME_NOW = Date.parse("2026-10-22T04:00:00Z");

export function homeCategory(id: string, name: string, group: ExpenseCategory["group"]): ExpenseCategory {
  return { id, tenantId: "t1", systemKey: id, name, icon: null, group, needsNote: false, sortOrder: 0, archivedAt: null };
}

export const HOME_CATEGORIES: readonly ExpenseCategory[] = [
  homeCategory("lpg", "Gas / LPG", "utilities"),
  homeCategory("ice", "Ice (Yelo)", "ingredients"),
  homeCategory("palengke", "Palengke", "ingredients"),
  homeCategory("rent", "Rent (Upa)", "occupancy"),
  homeCategory("wages", "Sahod", "staff"),
  homeCategory("owner_draw", "Owner took cash", "not_expense"),
];

export function homeExpense(overrides: Partial<Expense>): Expense {
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
    createdAt: "2026-10-22T00:00:00Z",
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

export function homeQueued(overrides: Partial<QueuedExpense> & { spentOn?: string; amountCents?: number; categoryId?: string; note?: string }): QueuedExpense {
  const { spentOn = "2026-10-22", amountCents = 15_000, categoryId = "ice", note = "", ...rest } = overrides;
  return {
    id: "req-q",
    tenantId: "t1",
    categoryName: "Ice (Yelo)",
    attempts: 1,
    retryAt: null,
    createdAt: Date.parse("2026-10-22T03:30:00Z"),
    refusedReason: null,
    payload: {
      kind: "book",
      createdByName: "Ben",
      draft: {
        amountCents,
        categoryId,
        spentOn,
        paidFrom: "cash",
        outletId: null,
        note,
        clientRequestId: rest.id ?? "req-q",
      },
    },
    ...rest,
  };
}
