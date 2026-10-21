/**
 * Expenses — shared types (contract: docs/plans/expenses/contract.md).
 *
 * Money is integer centavos (`*Cents`), dates are Asia/Manila business dates
 * (`YYYY-MM-DD`). Change this file only together with the contract.
 */

export const EXPENSE_GROUPS = [
  'ingredients',
  'staff',
  'occupancy',
  'utilities',
  'operating',
  'admin',
  'other',
  'capex',
  'not_expense',
] as const
export type ExpenseGroup = (typeof EXPENSE_GROUPS)[number]

/** Groups that reduce operating profit (capex sits below it; not_expense never). */
export const OPERATING_GROUPS: readonly ExpenseGroup[] = [
  'ingredients',
  'staff',
  'occupancy',
  'utilities',
  'operating',
  'admin',
  'other',
]

export const PAID_FROM = ['drawer', 'cash', 'gcash', 'maya', 'bank', 'card', 'owner'] as const
export type PaidFrom = (typeof PAID_FROM)[number]

export const DOC_TYPES = ['vat_invoice', 'non_vat_invoice', 'acknowledgement', 'none'] as const
export type DocType = (typeof DOC_TYPES)[number]

export const SUPPLIER_KINDS = ['supplier', 'landlord', 'utility', 'staff', 'government', 'other'] as const
export type SupplierKind = (typeof SUPPLIER_KINDS)[number]

export type ExpenseStatus = 'recorded' | 'void'

export interface ExpenseCategory {
  id: string
  tenantId: string
  systemKey: string | null
  name: string
  icon: string | null
  group: ExpenseGroup
  needsNote: boolean
  sortOrder: number
  archivedAt: string | null
}

export interface Supplier {
  id: string
  tenantId: string
  name: string
  kind: SupplierKind
  tin: string | null
  defaultCategoryId: string | null
  phone: string | null
  note: string | null
  archivedAt: string | null
}

export interface TaxDetails {
  docType: DocType | null
  invoiceNo: string | null
  supplierTin: string | null
  vatCents: number | null
  ewtCents: number | null
  ewtRate: number | null
  form2307Given: boolean
}

export interface Expense extends TaxDetails {
  id: string
  tenantId: string
  outletId: string | null
  categoryId: string
  supplierId: string | null
  paidToName: string | null
  staffUserId: string | null
  note: string | null
  amountCents: number
  spentOn: string
  paidFrom: PaidFrom
  shiftCashMovementId: string | null
  isStockPurchase: boolean
  status: ExpenseStatus
  voidReason: string | null
  voidedBy: string | null
  voidedAt: string | null
  replacesExpenseId: string | null
  clientRequestId: string | null
  createdBy: string | null
  createdByName: string
  createdAt: string
  receiptCount: number
}

/** What a person fills in to record a NON-drawer expense. */
export interface ExpenseDraft extends Partial<TaxDetails> {
  amountCents: number
  categoryId: string
  spentOn: string
  paidFrom: Exclude<PaidFrom, 'drawer'>
  outletId: string | null
  note?: string | null
  supplierId?: string | null
  paidToName?: string | null
  isStockPurchase?: boolean
  clientRequestId: string
}

/** What a cashier fills in to pay an expense from their open drawer. */
export interface DrawerExpenseDraft {
  shiftId: string
  amountCents: number
  categoryId: string
  note?: string | null
  supplierId?: string | null
  paidToName?: string | null
  clientRequestId: string
}

/** A drawer pay-out recorded without a category (older app builds). */
export interface UnsortedPayout {
  movementId: string
  shiftId: string
  outletId: string | null
  amountCents: number
  reason: string
  recordedByName: string
  createdAt: string
}

export type ExpenseFlag =
  | 'no_receipt'
  | 'possible_duplicate'
  | 'round_other'
  | 'after_hours_void'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }
