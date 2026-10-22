/**
 * "Bills to pay" web fixtures. Today is Thursday 2026-10-22 (Manila).
 *
 * - Rent: ₱15,000 on the 5th, from GCash; October's is still open (17 days late).
 * - Kuryente: changes every time, on the 24th; paid ₱6,000 and ₱6,400 → about ₱6,200, due Sat.
 * - Internet: ₱1,699 on the 15th; October's is paid.
 */

import type { Bill, BillPayment } from '@/lib/expenses/bill-schedule'
import type { ExpenseCategory } from '@/lib/expenses/types'
import type { BillsPageData } from '@/components/admin/expenses/bills/bills-page-data'
import { ELECTRICITY, ICE, LPG, OTHER, OWNER_DRAW, TENANT_ID, TENANT_SLUG, category } from './ui-fixtures'

export const TODAY = '2026-10-22'
/** 2026-10-22 12:00 in Manila. */
export const NOW = new Date('2026-10-22T04:00:00.000Z')

export const RENT = category('Rent (Upa)', 'occupancy', { systemKey: 'rent', icon: 'RE', sortOrder: 80 })
export const INTERNET = category('Internet & load', 'utilities', { systemKey: 'internet', icon: 'NT', sortOrder: 120 })
export const WAGES = category('Salaries & wages (Sahod)', 'staff', { systemKey: 'wages', icon: 'SW', sortOrder: 40 })
export const BILL_CATEGORIES: ExpenseCategory[] = [ICE, RENT, ELECTRICITY, LPG, INTERNET, WAGES, OTHER, OWNER_DRAW]

export const RENT_BILL_ID = '10000000-0000-4000-8000-000000000001'
export const KURYENTE_BILL_ID = '10000000-0000-4000-8000-000000000002'
export const INTERNET_BILL_ID = '10000000-0000-4000-8000-000000000003'

export function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: RENT_BILL_ID,
    tenantId: TENANT_ID,
    outletId: null,
    name: 'Rent',
    categoryId: RENT.id,
    supplierId: null,
    paidToName: 'Aling Rosa',
    paidFrom: 'gcash',
    amountCents: 1_500_000,
    rule: { kind: 'monthly', day: 5 },
    startsOn: '2026-10-01',
    endsOn: null,
    remindDaysBefore: 3,
    status: 'active',
    pausedUntil: null,
    pausedOn: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

export const RENT_BILL = bill()
export const KURYENTE_BILL = bill({
  id: KURYENTE_BILL_ID,
  name: 'Kuryente',
  categoryId: ELECTRICITY.id,
  paidToName: null,
  paidFrom: 'cash',
  amountCents: null,
  rule: { kind: 'monthly', day: 24 },
  startsOn: '2026-08-01',
  remindDaysBefore: 1,
})
export const INTERNET_BILL = bill({
  id: INTERNET_BILL_ID,
  name: 'Internet',
  categoryId: INTERNET.id,
  paidToName: null,
  paidFrom: 'bank',
  amountCents: 169_900,
  rule: { kind: 'monthly', day: 15 },
  startsOn: '2026-09-01',
  remindDaysBefore: 1,
})

export function billPayment(billId: string, dueOn: string, amountCents: number, spentOn = dueOn): BillPayment {
  return { billId, dueOn, expenseId: `paid-${billId.slice(-1)}-${dueOn}`, amountCents, spentOn }
}

export const PAYMENTS: BillPayment[] = [
  billPayment(KURYENTE_BILL_ID, '2026-08-24', 600_000),
  billPayment(KURYENTE_BILL_ID, '2026-09-24', 640_000),
  billPayment(INTERNET_BILL_ID, '2026-09-15', 169_900),
  billPayment(INTERNET_BILL_ID, '2026-10-15', 169_900, '2026-10-14'),
]

export function billsPageData(overrides: Partial<BillsPageData> = {}): BillsPageData {
  return {
    tenantId: TENANT_ID,
    tenantSlug: TENANT_SLUG,
    today: TODAY,
    monthKey: null,
    categories: BILL_CATEGORIES,
    suppliers: [],
    outlets: [],
    outletNames: {},
    isMultiBranch: false,
    lockedOutletId: null,
    lockedBranchLabel: null,
    tracksStock: false,
    bills: [RENT_BILL, KURYENTE_BILL, INTERNET_BILL],
    marks: [],
    payments: PAYMENTS,
    recentExpenses: [],
    ...overrides,
  }
}
