/**
 * Expenses — database rows ⇄ domain objects.
 *
 * The row shapes are declared HERE rather than read from `src/types/database.ts`
 * so the expense code does not depend on the generated types having caught up
 * with the migrations. Column names follow docs/plans/expenses/contract.md §2.
 *
 * `bigint` columns can arrive as a JSON number or, through some paths, a
 * string; `numeric` columns (`ewt_rate`, `shift_cash_movements.amount`) arrive
 * as strings. Everything is read through `toInt` / `toCents` so a centavo is
 * never lost to float pesos.
 */

import { toCents } from '@/lib/reports/money'
import type {
  DocType,
  Expense,
  ExpenseCategory,
  ExpenseGroup,
  ExpenseStatus,
  PaidFrom,
  Supplier,
  SupplierKind,
  UnsortedPayout,
} from './types'
import type {
  CategorySaveInput,
  ExpenseDetailsUpdateInput,
  ExpenseDraftInput,
  ReplacePatchInput,
  SupplierSaveInput,
} from './validation'

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

type Int = number | string

export interface ExpenseCategoryRow {
  id: string
  tenant_id: string
  system_key: string | null
  name: string
  icon: string | null
  grp: string
  needs_note: boolean
  sort_order: number
  archived_at: string | null
  created_at?: string
}

export interface SupplierRow {
  id: string
  tenant_id: string
  name: string
  kind: string
  tin: string | null
  default_category_id: string | null
  phone: string | null
  note: string | null
  archived_at: string | null
  created_by?: string | null
  created_at?: string
}

/** PostgREST answers an embedded `expense_receipts(count)` with `[{ count }]`. */
export type ReceiptCountEmbed = ReadonlyArray<{ count: Int }> | null | undefined

export interface ExpenseRow {
  id: string
  tenant_id: string
  outlet_id: string | null
  category_id: string
  supplier_id: string | null
  paid_to_name: string | null
  staff_user_id: string | null
  note: string | null
  amount_cents: Int
  spent_on: string
  paid_from: string
  shift_cash_movement_id: string | null
  is_stock_purchase: boolean
  doc_type: string | null
  invoice_no: string | null
  supplier_tin: string | null
  vat_cents: Int | null
  ewt_cents: Int | null
  ewt_rate: Int | null
  form_2307_given: boolean
  status: string
  void_reason: string | null
  voided_by: string | null
  voided_at: string | null
  replaces_expense_id: string | null
  client_request_id: string | null
  created_by: string | null
  created_by_name: string
  created_at: string
  updated_at?: string
  expense_receipts?: ReceiptCountEmbed
}

export interface ExpenseReceiptRow {
  id: string
  tenant_id: string
  expense_id: string
  outlet_id: string | null
  object_path: string
  mime: string
  bytes: Int
  uploaded_by: string | null
  created_at: string
}

export interface ShiftCashMovementRow {
  id: string
  shift_id: string
  tenant_id: string
  outlet_id: string | null
  kind: string
  amount: Int
  reason: string | null
  recorded_by: string | null
  recorded_by_name: string
  created_at: string
}

/** A receipt as the expense book shows it (the object path never leaves the server). */
export interface ExpenseReceipt {
  id: string
  expenseId: string
  mime: string
  bytes: number
  uploadedBy: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export const EXPENSE_COLUMNS = [
  'id', 'tenant_id', 'outlet_id', 'category_id', 'supplier_id', 'paid_to_name', 'staff_user_id', 'note',
  'amount_cents', 'spent_on', 'paid_from', 'shift_cash_movement_id', 'is_stock_purchase', 'doc_type',
  'invoice_no', 'supplier_tin', 'vat_cents', 'ewt_cents', 'ewt_rate', 'form_2307_given', 'status',
  'void_reason', 'voided_by', 'voided_at', 'replaces_expense_id', 'client_request_id', 'created_by',
  'created_by_name', 'created_at',
].join(', ')

/** The expense columns plus a receipt count (RLS on receipts follows the expense). */
export const EXPENSE_WITH_RECEIPT_COUNT = `${EXPENSE_COLUMNS}, expense_receipts(count)`

export const CATEGORY_COLUMNS = 'id, tenant_id, system_key, name, icon, grp, needs_note, sort_order, archived_at'

export const SUPPLIER_COLUMNS = 'id, tenant_id, name, kind, tin, default_category_id, phone, note, archived_at'

export const RECEIPT_COLUMNS = 'id, expense_id, mime, bytes, uploaded_by, created_at'

export const MOVEMENT_COLUMNS = 'id, shift_id, outlet_id, amount, reason, recorded_by_name, created_at'

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** A bigint/int column as a number; 0 for anything unreadable. */
export function toInt(value: Int | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number.parseInt(value, 10)
  return 0
}

function toNullableInt(value: Int | null | undefined): number | null {
  return value === null || value === undefined ? null : toInt(value)
}

function toNullableNumber(value: Int | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** The count from an embedded `expense_receipts(count)`; 0 when absent. */
export function receiptCountOf(embed: ReceiptCountEmbed): number {
  return Array.isArray(embed) && embed.length > 0 ? toInt(embed[0]?.count) : 0
}

export function toExpenseCategory(row: ExpenseCategoryRow): ExpenseCategory {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    systemKey: row.system_key ?? null,
    name: row.name,
    icon: row.icon ?? null,
    group: row.grp as ExpenseGroup,
    needsNote: row.needs_note === true,
    sortOrder: toInt(row.sort_order),
    archivedAt: row.archived_at ?? null,
  }
}

export function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    kind: row.kind as SupplierKind,
    tin: row.tin ?? null,
    defaultCategoryId: row.default_category_id ?? null,
    phone: row.phone ?? null,
    note: row.note ?? null,
    archivedAt: row.archived_at ?? null,
  }
}

/** `receiptCount` overrides the embedded count (e.g. when receipts were read separately). */
export function toExpense(row: ExpenseRow, receiptCount?: number): Expense {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outletId: row.outlet_id ?? null,
    categoryId: row.category_id,
    supplierId: row.supplier_id ?? null,
    paidToName: row.paid_to_name ?? null,
    staffUserId: row.staff_user_id ?? null,
    note: row.note ?? null,
    amountCents: toInt(row.amount_cents),
    spentOn: row.spent_on,
    paidFrom: row.paid_from as PaidFrom,
    shiftCashMovementId: row.shift_cash_movement_id ?? null,
    isStockPurchase: row.is_stock_purchase === true,
    docType: (row.doc_type ?? null) as DocType | null,
    invoiceNo: row.invoice_no ?? null,
    supplierTin: row.supplier_tin ?? null,
    vatCents: toNullableInt(row.vat_cents),
    ewtCents: toNullableInt(row.ewt_cents),
    ewtRate: toNullableNumber(row.ewt_rate),
    form2307Given: row.form_2307_given === true,
    status: row.status as ExpenseStatus,
    voidReason: row.void_reason ?? null,
    voidedBy: row.voided_by ?? null,
    voidedAt: row.voided_at ?? null,
    replacesExpenseId: row.replaces_expense_id ?? null,
    clientRequestId: row.client_request_id ?? null,
    createdBy: row.created_by ?? null,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    receiptCount: receiptCount ?? receiptCountOf(row.expense_receipts),
  }
}

export function toExpenseReceipt(row: Pick<ExpenseReceiptRow, 'id' | 'expense_id' | 'mime' | 'bytes' | 'uploaded_by' | 'created_at'>): ExpenseReceipt {
  return {
    id: row.id,
    expenseId: row.expense_id,
    mime: row.mime,
    bytes: toInt(row.bytes),
    uploadedBy: row.uploaded_by ?? null,
    createdAt: row.created_at,
  }
}

export function toUnsortedPayout(
  row: Pick<ShiftCashMovementRow, 'id' | 'shift_id' | 'outlet_id' | 'amount' | 'reason' | 'recorded_by_name' | 'created_at'>,
): UnsortedPayout {
  return {
    movementId: row.id,
    shiftId: row.shift_id,
    outletId: row.outlet_id ?? null,
    // `amount` is numeric pesos; the link check is round(amount * 100).
    amountCents: toCents(row.amount),
    reason: row.reason ?? '',
    recordedByName: row.recorded_by_name,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

/** Only keys the caller actually sent: an absent key must leave the column alone. */
function definedOnly(entries: ReadonlyArray<readonly [string, unknown]>): Row {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined))
}

/** Tax fields, camelCase → snake_case, sent keys only. */
function taxColumns(input: Partial<Pick<ExpenseDraftInput, 'docType' | 'invoiceNo' | 'supplierTin' | 'vatCents' | 'ewtCents' | 'ewtRate' | 'form2307Given'>>): Row {
  return definedOnly([
    ['doc_type', input.docType],
    ['invoice_no', input.invoiceNo],
    ['supplier_tin', input.supplierTin],
    ['vat_cents', input.vatCents],
    ['ewt_cents', input.ewtCents],
    ['ewt_rate', input.ewtRate],
    ['form_2307_given', input.form2307Given],
  ])
}

export interface ExpenseInsertContext {
  tenantId: string
  createdByName: string
}

/**
 * The INSERT for a non-drawer expense. `created_by`, `created_at` and `status`
 * are stamped by the database for client roles; they are never sent.
 */
export function expenseDraftToInsert(draft: ExpenseDraftInput, context: ExpenseInsertContext): Row {
  return {
    tenant_id: context.tenantId,
    outlet_id: draft.outletId,
    category_id: draft.categoryId,
    amount_cents: draft.amountCents,
    spent_on: draft.spentOn,
    paid_from: draft.paidFrom,
    client_request_id: draft.clientRequestId,
    created_by_name: context.createdByName,
    ...definedOnly([
      ['note', draft.note],
      ['supplier_id', draft.supplierId],
      ['paid_to_name', draft.paidToName],
      ['is_stock_purchase', draft.isStockPurchase],
    ]),
    ...taxColumns(draft),
  }
}

/**
 * The UPDATE for the in-place editable fields — the guard trigger refuses any
 * other column (stock answer, VAT and withholding go through `replace_expense`).
 */
export function detailsUpdateToRow(update: ExpenseDetailsUpdateInput, nowIso: string): Row {
  return {
    ...definedOnly([
      ['note', update.note],
      ['supplier_id', update.supplierId],
      ['paid_to_name', update.paidToName],
      ['doc_type', update.docType],
      ['invoice_no', update.invoiceNo],
      ['supplier_tin', update.supplierTin],
      ['form_2307_given', update.form2307Given],
    ]),
    updated_at: nowIso,
  }
}

/** `replace_expense`'s `p_patch`: the contract's snake_case keys, sent keys only. */
export function replacePatchToJson(patch: ReplacePatchInput): Row {
  return {
    ...definedOnly([
      ['category_id', patch.categoryId],
      ['amount_cents', patch.amountCents],
      ['spent_on', patch.spentOn],
      ['paid_from', patch.paidFrom],
      ['outlet_id', patch.outletId],
      ['note', patch.note],
      ['supplier_id', patch.supplierId],
      ['paid_to_name', patch.paidToName],
      ['is_stock_purchase', patch.isStockPurchase],
    ]),
    ...taxColumns(patch),
  }
}

/** Category columns a client may write (never `system_key` or `tenant_id` on update). */
export function categoryToRow(input: CategorySaveInput): Row {
  return definedOnly([
    ['name', input.name],
    ['grp', input.group],
    ['icon', input.icon],
    ['needs_note', input.needsNote],
    ['sort_order', input.sortOrder],
  ])
}

export function supplierToRow(input: SupplierSaveInput, nowIso: string): Row {
  return {
    ...definedOnly([
      ['name', input.name],
      ['kind', input.kind],
      ['tin', input.tin],
      ['default_category_id', input.defaultCategoryId],
      ['phone', input.phone],
      ['note', input.note],
    ]),
    ...(input.archived === undefined ? {} : { archived_at: input.archived ? nowIso : null }),
  }
}
