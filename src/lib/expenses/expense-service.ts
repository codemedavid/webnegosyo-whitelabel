/**
 * Expenses — writes, through the CALLER's session client only.
 *
 * RLS and the guard/link triggers are the boundary; this module makes their
 * refusals visible. A refusal under RLS is usually SILENT — an UPDATE that
 * matches zero rows, an INSERT … RETURNING that returns nothing — so every
 * write here asserts the rows it affected instead of trusting "no error".
 *
 * Inputs arrive already parsed by `validation.ts` (the actions do that).
 * Reads live in `read/expenses-read.ts`.
 */

import { EXPENSE_MESSAGES, isClientRequestConflict, isUniqueViolation, toExpenseError } from './errors'
import {
  CATEGORY_COLUMNS,
  EXPENSE_COLUMNS,
  SUPPLIER_COLUMNS,
  categoryToRow,
  detailsUpdateToRow,
  expenseDraftToInsert,
  replacePatchToJson,
  supplierToRow,
  toExpense,
  toExpenseCategory,
  toSupplier,
  type ExpenseCategoryRow,
  type ExpenseRow,
  type SupplierRow,
} from './rows'
import type { ExpenseDb } from './read/expenses-read'
import type { Expense, ExpenseCategory, Supplier } from './types'
import type {
  ArchiveCategoryInput,
  CategorySaveInput,
  DrawerExpenseDraftInput,
  ExpenseDetailsUpdateInput,
  ExpenseDraftInput,
  ReplaceExpenseInput,
  SortDrawerPayoutInput,
  SupplierSaveInput,
  VoidExpenseInput,
} from './validation'
import { MAX_CREATED_BY_NAME_LENGTH } from './validation'

interface WriteResult<T> {
  data: T | null
  error: { code?: string; message: string; details?: string; hint?: string } | null
}

/** Who is writing, for the `*_by_name` snapshot columns. */
export interface ExpenseActor {
  displayName: string
}

/** A name for the `created_by_name` column: trimmed, 1–80 characters. */
export function actorName(actor: ExpenseActor): string {
  const name = actor.displayName.trim().slice(0, MAX_CREATED_BY_NAME_LENGTH)
  return name.length > 0 ? name : 'Staff'
}

function nowIso(): string {
  return new Date().toISOString()
}

/** An RPC answer that should be a uuid. */
function expectId(context: string, data: unknown): string {
  if (typeof data === 'string' && data.length > 0) return data
  throw toExpenseError(context, { code: 'no_id', message: 'the database returned no id' }, EXPENSE_MESSAGES.unknown)
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

async function findByClientRequest(db: ExpenseDb, tenantId: string, clientRequestId: string): Promise<Expense | null> {
  const { data, error } = (await db
    .from('expenses')
    .select(EXPENSE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('client_request_id', clientRequestId)
    .maybeSingle()) as WriteResult<ExpenseRow>
  if (error) throw toExpenseError('find by request id', error)
  return data ? toExpense(data) : null
}

/**
 * Records a NON-drawer expense. A second send of the same `clientRequestId`
 * (a double tap, a retried request) returns the first one instead of a copy.
 */
export async function recordExpense(
  db: ExpenseDb,
  tenantId: string,
  draft: ExpenseDraftInput,
  actor: ExpenseActor,
): Promise<Expense> {
  const row = expenseDraftToInsert(draft, { tenantId, createdByName: actorName(actor) })
  const { data, error } = (await db.from('expenses').insert(row).select(EXPENSE_COLUMNS)) as WriteResult<ExpenseRow[]>

  if (error && isClientRequestConflict(error)) {
    const existing = await findByClientRequest(db, tenantId, draft.clientRequestId)
    if (existing) return existing
  }
  if (error) throw toExpenseError('record expense', error)
  // RETURNING passes through the SELECT policy: no row back = not allowed.
  if (!data || data.length !== 1) throw toExpenseError('record expense', { code: '42501', message: 'no row returned' })
  return toExpense(data[0], 0)
}

/**
 * Voids a recorded expense (the RPC stamps who and when). A DRAWER expense on
 * a still-open shift also puts the cash back with a `pay_in` correction filed
 * under the actor's name; on a closed shift the RPC refuses (`drawer_shift_closed`).
 */
export async function voidExpense(db: ExpenseDb, input: VoidExpenseInput, actor: ExpenseActor): Promise<void> {
  const { error } = await db.rpc('void_expense', {
    p_expense_id: input.expenseId,
    p_reason: input.reason,
    p_actor_name: actorName(actor),
  })
  if (error) throw toExpenseError('void expense', error)
}

/** Voids the old row and records a corrected copy; returns the new id. */
export async function replaceExpense(db: ExpenseDb, input: ReplaceExpenseInput): Promise<string> {
  const { data, error } = await db.rpc('replace_expense', {
    p_expense_id: input.expenseId,
    p_reason: input.reason,
    p_patch: replacePatchToJson(input.patch),
  })
  if (error) throw toExpenseError('replace expense', error)
  return expectId('replace expense', data)
}

/**
 * Pays an expense out of an open drawer: the pay-out and the expense in one
 * transaction (`record_drawer_expense`, SECURITY INVOKER, so the drawer's own
 * rule decides — own drawer, or a cash manager of that branch). A retried
 * `clientRequestId` returns the first expense and takes no more cash out.
 * Returns the expense id.
 */
export async function recordDrawerExpense(db: ExpenseDb, input: DrawerExpenseDraftInput, actor: ExpenseActor): Promise<string> {
  const { data, error } = await db.rpc('record_drawer_expense', {
    p_shift_id: input.shiftId,
    p_amount_cents: input.amountCents,
    p_category_id: input.categoryId,
    p_note: input.note ?? null,
    p_supplier_id: input.supplierId ?? null,
    p_paid_to_name: input.paidToName ?? null,
    p_recorded_by_name: actorName(actor),
    p_client_request_id: input.clientRequestId,
    // Sent only when yes: a "no" is the default, and keeps working on a database without the argument.
    ...(input.isStockPurchase === true ? { p_is_stock_purchase: true } : {}),
  })
  if (error) {
    // The drawer's row-level rule refusing the pay-out is about whose drawer it is, not the expense book.
    const override = error.code === '42501' && /row-level security/i.test(error.message ?? '') ? EXPENSE_MESSAGES.drawerNotYours : undefined
    throw toExpenseError('record drawer expense', error, override)
  }
  return expectId('record drawer expense', data)
}

/** Files an existing drawer pay-out under a category; returns the expense id. */
export async function sortDrawerPayout(db: ExpenseDb, input: SortDrawerPayoutInput, actor: ExpenseActor): Promise<string> {
  const { data, error } = await db.rpc('sort_drawer_payout', {
    p_movement_id: input.movementId,
    p_category_id: input.categoryId,
    p_note: input.note ?? null,
    p_supplier_id: input.supplierId ?? null,
    p_paid_to_name: input.paidToName ?? null,
    p_recorded_by_name: actorName(actor),
  })
  if (error) throw toExpenseError('sort pay-out', error)
  return expectId('sort pay-out', data)
}

/** Fixes the in-place editable fields of a RECORDED expense. */
export async function updateExpenseDetails(db: ExpenseDb, tenantId: string, update: ExpenseDetailsUpdateInput): Promise<Expense> {
  const { data, error } = (await db
    .from('expenses')
    .update(detailsUpdateToRow(update, nowIso()))
    .eq('tenant_id', tenantId)
    .eq('id', update.expenseId)
    .eq('status', 'recorded')
    .select(EXPENSE_COLUMNS)) as WriteResult<ExpenseRow[]>
  if (error) throw toExpenseError('update expense', error)
  if (!data || data.length !== 1) {
    throw toExpenseError('update expense', { code: 'P0002', message: 'no row updated' })
  }
  return toExpense(data[0])
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** Creates (no id) or edits a category. Seeded categories keep their `system_key`. */
export async function saveCategory(db: ExpenseDb, tenantId: string, input: CategorySaveInput): Promise<ExpenseCategory> {
  const columns = categoryToRow(input)
  const request = input.id
    ? db.from('expense_categories').update(columns).eq('tenant_id', tenantId).eq('id', input.id)
    : db.from('expense_categories').insert({ ...columns, tenant_id: tenantId })
  const { data, error } = (await request.select(CATEGORY_COLUMNS)) as WriteResult<ExpenseCategoryRow[]>

  if (error && isUniqueViolation(error)) throw toExpenseError('save category', error, EXPENSE_MESSAGES.categoryNameTaken)
  if (error) throw toExpenseError('save category', error)
  if (!data || data.length !== 1) {
    const refusal = input.id ? EXPENSE_MESSAGES.categoryGone : EXPENSE_MESSAGES.noAccess
    throw toExpenseError('save category', { code: '42501', message: 'no row written' }, refusal)
  }
  return toExpenseCategory(data[0])
}

/** Archives (default) or restores a category. Categories are never deleted. */
export async function archiveCategory(db: ExpenseDb, tenantId: string, input: ArchiveCategoryInput): Promise<ExpenseCategory> {
  const archived = input.archived ?? true
  const { data, error } = (await db
    .from('expense_categories')
    .update({ archived_at: archived ? nowIso() : null })
    .eq('tenant_id', tenantId)
    .eq('id', input.id)
    .select(CATEGORY_COLUMNS)) as WriteResult<ExpenseCategoryRow[]>
  // Restoring next to a live category of the same name trips the unique index.
  if (error && isUniqueViolation(error)) throw toExpenseError('archive category', error, EXPENSE_MESSAGES.categoryNameTaken)
  if (error) throw toExpenseError('archive category', error)
  if (!data || data.length !== 1) {
    throw toExpenseError('archive category', { code: '42501', message: 'no row updated' }, EXPENSE_MESSAGES.categoryGone)
  }
  return toExpenseCategory(data[0])
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

/** Creates (no id) or edits a supplier ("Paid to"); `archived` archives or restores it. */
export async function saveSupplier(db: ExpenseDb, tenantId: string, input: SupplierSaveInput): Promise<Supplier> {
  const columns = supplierToRow(input, nowIso())
  const request = input.id
    ? db.from('suppliers').update(columns).eq('tenant_id', tenantId).eq('id', input.id)
    : db.from('suppliers').insert({ ...columns, tenant_id: tenantId })
  const { data, error } = (await request.select(SUPPLIER_COLUMNS)) as WriteResult<SupplierRow[]>

  if (error && isUniqueViolation(error)) throw toExpenseError('save supplier', error, EXPENSE_MESSAGES.supplierNameTaken)
  if (error) throw toExpenseError('save supplier', error)
  if (!data || data.length !== 1) {
    const refusal = input.id ? EXPENSE_MESSAGES.supplierGone : EXPENSE_MESSAGES.noAccess
    throw toExpenseError('save supplier', { code: '42501', message: 'no row written' }, refusal)
  }
  return toSupplier(data[0])
}

// Reads live beside the writes' module; re-exported so callers import one place.
export {
  getExpense,
  listCategories,
  listExpenses,
  listSuppliers,
  listUnsortedPayouts,
  type ExpenseDb,
  type ExpenseDetail,
  type ExpenseList,
  type ExpenseListQuery,
} from './read/expenses-read'
