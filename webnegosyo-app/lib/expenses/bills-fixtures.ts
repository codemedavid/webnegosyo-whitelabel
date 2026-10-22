/**
 * Builders for "Bills to pay" screen tests. Not a test file: shared by the
 * view-model tests and the rendered sheet tests.
 */
import type { Bill, BillMark, BillPayment } from "./bill-schedule";
import type { ExpenseCategory } from "./types";

export const BILL_TODAY = "2026-10-22";

export function billOf(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "bill-rent",
    tenantId: "t1",
    outletId: null,
    name: "Rent",
    categoryId: "rent",
    supplierId: null,
    paidToName: "Aling Nena",
    paidFrom: "bank",
    amountCents: 1_500_000,
    rule: { kind: "monthly", day: 24 },
    startsOn: "2026-01-01",
    endsOn: null,
    remindDaysBefore: 3,
    status: "active",
    pausedUntil: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function paymentOf(overrides: Partial<BillPayment> = {}): BillPayment {
  return { billId: "bill-rent", dueOn: "2026-09-24", expenseId: "exp-1", amountCents: 1_500_000, spentOn: "2026-09-24", ...overrides };
}

export function markOf(overrides: Partial<BillMark> = {}): BillMark {
  return { billId: "bill-rent", dueOn: "2026-10-24", kind: "skipped", snoozedUntil: null, ...overrides };
}

function categoryOf(id: string, name: string, group: ExpenseCategory["group"], sortOrder: number): ExpenseCategory {
  return { id, tenantId: "t1", systemKey: id, name, icon: null, group, needsNote: false, sortOrder, archivedAt: null };
}

/** Seeded-looking categories: system keys equal ids, so presets find them. */
export const BILL_CATEGORIES: readonly ExpenseCategory[] = [
  categoryOf("rent", "Rent (Upa)", "occupancy", 10),
  categoryOf("electricity", "Kuryente", "utilities", 20),
  categoryOf("water", "Tubig", "utilities", 30),
  categoryOf("internet", "Internet", "utilities", 40),
  categoryOf("lpg", "Gas / LPG", "utilities", 50),
  categoryOf("wages", "Sahod", "staff", 60),
  categoryOf("gov_contributions", "SSS · PhilHealth · Pag-IBIG", "staff", 70),
  categoryOf("other", "Other", "other", 80),
  categoryOf("ice", "Ice (Yelo)", "ingredients", 90),
  categoryOf("palengke", "Palengke", "ingredients", 100),
  categoryOf("loan_payment", "Loan payment", "not_expense", 110),
];
