/**
 * Builders for the app's Bills to pay tests (reminders, Home row, Profit,
 * Needs you). Mirrors the web's tests/unit/expenses/bill-fixtures.ts: "today"
 * is Thursday 2026-10-22, a Manila business date.
 */
import type { Bill, BillMark, BillPayment } from "./bill-schedule";

export const BILL_TODAY = "2026-10-22";
/** 10:00 in Manila on BILL_TODAY. */
export const BILL_NOW_MS = Date.parse("2026-10-22T10:00:00+08:00");

export function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "bill-rent",
    tenantId: "tenant-1",
    outletId: null,
    name: "Rent",
    categoryId: "cat-rent",
    supplierId: null,
    paidToName: null,
    paidFrom: "cash",
    amountCents: 1_500_000,
    rule: { kind: "monthly", day: 5 },
    startsOn: "2026-08-01",
    endsOn: null,
    remindDaysBefore: 3,
    status: "active",
    pausedUntil: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

export function billPayment(dueOn: string, amountCents = 1_500_000, billId = "bill-rent"): BillPayment {
  return { billId, dueOn, expenseId: `exp-${billId}-${dueOn}`, amountCents, spentOn: dueOn };
}

export function billMark(dueOn: string, kind: BillMark["kind"], snoozedUntil: string | null = null, billId = "bill-rent"): BillMark {
  return { billId, dueOn, kind, snoozedUntil };
}

/** Rent paid on time in August, September and October: next due 5 November. */
export const RENT_PAID_UP: readonly BillPayment[] = [billPayment("2026-08-05"), billPayment("2026-09-05"), billPayment("2026-10-05")];
