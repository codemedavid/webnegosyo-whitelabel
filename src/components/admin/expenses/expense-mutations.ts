/**
 * The expense book's writes, as the screens call them.
 *
 * One seam over the server actions (`src/app/actions/expenses.ts`): every
 * screen calls these, so the action signatures live in one place and a thrown
 * error (a network drop, a server crash) comes back as a sentence, never as an
 * unhandled rejection in a click handler.
 */

import {
  archiveCategoryAction,
  recordExpenseAction,
  replaceExpenseAction,
  replaceExpenseInBulkAction,
  saveCategoryAction,
  saveSupplierAction,
  sortDrawerPayoutAction,
  updateExpenseDetailsAction,
  voidExpenseAction,
} from '@/app/actions/expenses'
import type { ActionResult, Expense, ExpenseCategory, ExpenseDraft, Supplier } from '@/lib/expenses/types'
import type {
  ArchiveCategoryInput,
  CategorySaveInput,
  ExpenseDetailsUpdateInput,
  ReplacePatchInput,
  SortDrawerPayoutInput,
  SupplierSaveInput,
} from '@/lib/expenses/validation'

const OFFLINE = 'Couldn’t reach the server. Check your connection and try again.'

async function run<T>(call: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const result = await call()
    if (!result || typeof result !== 'object' || !('ok' in result)) return { ok: false, error: 'Something went wrong. Try again.' }
    return result
  } catch {
    return { ok: false, error: OFFLINE }
  }
}

export function recordExpense(tenantSlug: string, draft: ExpenseDraft): Promise<ActionResult<Expense>> {
  return run(() => recordExpenseAction(tenantSlug, draft))
}

export function voidExpense(tenantSlug: string, expenseId: string, reason: string): Promise<ActionResult<null>> {
  return run(() => voidExpenseAction(tenantSlug, { expenseId, reason }))
}

export function replaceExpense(
  tenantSlug: string,
  expenseId: string,
  reason: string,
  patch: ReplacePatchInput,
): Promise<ActionResult<{ id: string }>> {
  return run(() => replaceExpenseAction(tenantSlug, { expenseId, reason, patch }))
}

/** One row of a bulk change: no page refresh; the caller refreshes once at the end. */
export function replaceExpenseInBulk(
  tenantSlug: string,
  expenseId: string,
  reason: string,
  patch: ReplacePatchInput,
): Promise<ActionResult<{ id: string }>> {
  return run(() => replaceExpenseInBulkAction(tenantSlug, { expenseId, reason, patch }))
}

export function updateExpenseDetails(tenantSlug: string, update: ExpenseDetailsUpdateInput): Promise<ActionResult<Expense>> {
  return run(() => updateExpenseDetailsAction(tenantSlug, update))
}

export function sortDrawerPayout(tenantSlug: string, input: SortDrawerPayoutInput): Promise<ActionResult<{ id: string }>> {
  return run(() => sortDrawerPayoutAction(tenantSlug, input))
}

export function saveCategory(tenantSlug: string, input: CategorySaveInput): Promise<ActionResult<ExpenseCategory>> {
  return run(() => saveCategoryAction(tenantSlug, input))
}

export function archiveCategory(tenantSlug: string, input: ArchiveCategoryInput): Promise<ActionResult<ExpenseCategory>> {
  return run(() => archiveCategoryAction(tenantSlug, input))
}

export function saveSupplier(tenantSlug: string, input: SupplierSaveInput): Promise<ActionResult<Supplier>> {
  return run(() => saveSupplierAction(tenantSlug, input))
}
