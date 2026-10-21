/**
 * Small, readable expense-book fixtures for the web UI tests.
 */

import type { Expense, ExpenseCategory, ExpenseGroup, UnsortedPayout } from '@/lib/expenses/types'

export const TENANT_ID = '00000000-0000-4000-8000-000000000001'
export const TENANT_SLUG = 'sukad'

let counter = 0
function uuid(): string {
  counter += 1
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
}

export function category(
  name: string,
  group: ExpenseGroup,
  overrides: Partial<ExpenseCategory> = {},
): ExpenseCategory {
  return {
    id: uuid(),
    tenantId: TENANT_ID,
    systemKey: null,
    name,
    icon: name.slice(0, 2).toUpperCase(),
    group,
    needsNote: false,
    sortOrder: 0,
    archivedAt: null,
    ...overrides,
  }
}

export const LPG = category('Gas / LPG', 'utilities', { systemKey: 'lpg', icon: 'LP', sortOrder: 110 })
export const ICE = category('Ice (Yelo)', 'ingredients', { systemKey: 'ice', icon: 'IC', sortOrder: 10 })
export const ELECTRICITY = category('Electricity (Kuryente)', 'utilities', { systemKey: 'electricity', icon: 'EL', sortOrder: 90 })
export const OTHER = category('Other', 'other', { systemKey: 'other', icon: 'OT', needsNote: true, sortOrder: 220 })
export const OWNER_DRAW = category('Owner took cash (Kinuha ng may-ari)', 'not_expense', { systemKey: 'owner_draw', icon: 'OW', sortOrder: 240 })
export const CATEGORIES: ExpenseCategory[] = [ICE, ELECTRICITY, LPG, OTHER, OWNER_DRAW]

export function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: uuid(),
    tenantId: TENANT_ID,
    outletId: null,
    categoryId: LPG.id,
    supplierId: null,
    paidToName: null,
    staffUserId: null,
    note: null,
    amountCents: 125_000,
    spentOn: '2026-10-21',
    paidFrom: 'cash',
    shiftCashMovementId: null,
    isStockPurchase: false,
    docType: null,
    invoiceNo: null,
    supplierTin: null,
    vatCents: null,
    ewtCents: null,
    ewtRate: null,
    form2307Given: false,
    status: 'recorded',
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    replacesExpenseId: null,
    clientRequestId: null,
    createdBy: null,
    createdByName: 'Ana',
    createdAt: '2026-10-21T01:42:00.000Z',
    receiptCount: 0,
    ...overrides,
  }
}

export function payout(overrides: Partial<UnsortedPayout> = {}): UnsortedPayout {
  return {
    movementId: uuid(),
    shiftId: uuid(),
    outletId: null,
    amountCents: 12_000,
    reason: 'yelo',
    recordedByName: 'Ana',
    createdAt: '2026-10-21T00:10:00.000Z',
    ...overrides,
  }
}
