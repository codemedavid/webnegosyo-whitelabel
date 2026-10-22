/**
 * Builders for the Bills to pay engine tests (bill-schedule, bill-reminders,
 * bill-suggestions). "Today" is Thursday 2026-10-22, a Manila business date.
 */
import type { Bill, BillContext, BillDraft, BillMark, BillPayment } from '@/lib/expenses/bill-schedule'

export const TODAY = '2026-10-22'

export function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-rent',
    tenantId: 'tenant-1',
    outletId: null,
    name: 'Rent',
    categoryId: 'cat-rent',
    supplierId: null,
    paidToName: null,
    paidFrom: 'cash',
    amountCents: 1_500_000,
    rule: { kind: 'monthly', day: 5 },
    startsOn: '2026-08-01',
    endsOn: null,
    remindDaysBefore: 3,
    status: 'active',
    pausedUntil: null,
    pausedOn: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

export function payment(dueOn: string, amountCents = 1_500_000, billId = 'bill-rent', spentOn = dueOn): BillPayment {
  return { billId, dueOn, expenseId: `exp-${billId}-${dueOn}`, amountCents, spentOn }
}

export function mark(dueOn: string, kind: BillMark['kind'], snoozedUntil: string | null = null, billId = 'bill-rent'): BillMark {
  return { billId, dueOn, kind, snoozedUntil }
}

export const ctx = (payments: BillPayment[] = [], marks: BillMark[] = [], today = TODAY): BillContext => ({ today, payments, marks })

export function makeDraft(overrides: Partial<BillDraft> = {}): BillDraft {
  return {
    name: 'Rent',
    categoryId: 'cat-rent',
    amountCents: 1_500_000,
    rule: { kind: 'monthly', day: 5 },
    startsOn: TODAY,
    endsOn: null,
    remindDaysBefore: 3,
    paidFrom: 'cash',
    ...overrides,
  }
}
