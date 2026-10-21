/**
 * Builders for the pure expenses engine tests. Each returns a fresh object;
 * pass overrides for the fields a test cares about.
 */
import { SEED_CATEGORIES } from '@/lib/expenses/categories'
import type { Expense, ExpenseCategory, Supplier } from '@/lib/expenses/types'

export const TENANT_ID = 'tenant-1'

let sequence = 0
function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}-${sequence}`
}

export function makeCategory(overrides: Partial<ExpenseCategory> = {}): ExpenseCategory {
  return {
    id: nextId('cat'),
    tenantId: TENANT_ID,
    systemKey: null,
    name: 'Custom',
    icon: null,
    group: 'operating',
    needsNote: false,
    sortOrder: 0,
    archivedAt: null,
    ...overrides,
  }
}

/** The seed list as a store's categories, id = `cat-<systemKey>`. */
export function seededCategories(): ExpenseCategory[] {
  return SEED_CATEGORIES.map((seed) => ({
    id: `cat-${seed.systemKey}`,
    tenantId: TENANT_ID,
    systemKey: seed.systemKey,
    name: seed.name,
    icon: seed.icon,
    group: seed.group,
    needsNote: seed.needsNote,
    sortOrder: seed.sortOrder,
    archivedAt: null,
  }))
}

export function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: nextId('exp'),
    tenantId: TENANT_ID,
    outletId: null,
    categoryId: 'cat-ice',
    supplierId: null,
    paidToName: null,
    staffUserId: null,
    note: null,
    amountCents: 12_000,
    spentOn: '2026-10-21',
    paidFrom: 'cash',
    shiftCashMovementId: null,
    isStockPurchase: false,
    status: 'recorded',
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    replacesExpenseId: null,
    clientRequestId: null,
    createdBy: 'user-1',
    createdByName: 'Ana',
    createdAt: '2026-10-21T02:00:00.000Z',
    receiptCount: 0,
    docType: null,
    invoiceNo: null,
    supplierTin: null,
    vatCents: null,
    ewtCents: null,
    ewtRate: null,
    form2307Given: false,
    ...overrides,
  }
}

export function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: nextId('sup'),
    tenantId: TENANT_ID,
    name: 'Aling Nena',
    kind: 'supplier',
    tin: null,
    defaultCategoryId: null,
    phone: null,
    note: null,
    archivedAt: null,
    ...overrides,
  }
}
