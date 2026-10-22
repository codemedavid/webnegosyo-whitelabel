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

/** Calls one action; a throw (network drop, server crash) comes back as a sentence. */
export async function runAction<T>(call: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const result = await call()
    if (!result || typeof result !== 'object' || !('ok' in result)) return { ok: false, error: 'Something went wrong. Try again.' }
    return result
  } catch {
    return { ok: false, error: OFFLINE }
  }
}

export function recordExpense(tenantSlug: string, draft: ExpenseDraft): Promise<ActionResult<Expense>> {
  return runAction(() => recordExpenseAction(tenantSlug, draft))
}

export function voidExpense(tenantSlug: string, expenseId: string, reason: string): Promise<ActionResult<null>> {
  return runAction(() => voidExpenseAction(tenantSlug, { expenseId, reason }))
}

export function replaceExpense(
  tenantSlug: string,
  expenseId: string,
  reason: string,
  patch: ReplacePatchInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(() => replaceExpenseAction(tenantSlug, { expenseId, reason, patch }))
}

/** One row of a bulk change: no page refresh; the caller refreshes once at the end. */
export function replaceExpenseInBulk(
  tenantSlug: string,
  expenseId: string,
  reason: string,
  patch: ReplacePatchInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(() => replaceExpenseInBulkAction(tenantSlug, { expenseId, reason, patch }))
}

export function updateExpenseDetails(tenantSlug: string, update: ExpenseDetailsUpdateInput): Promise<ActionResult<Expense>> {
  return runAction(() => updateExpenseDetailsAction(tenantSlug, update))
}

export function sortDrawerPayout(tenantSlug: string, input: SortDrawerPayoutInput): Promise<ActionResult<{ id: string }>> {
  return runAction(() => sortDrawerPayoutAction(tenantSlug, input))
}

export function saveCategory(tenantSlug: string, input: CategorySaveInput): Promise<ActionResult<ExpenseCategory>> {
  return runAction(() => saveCategoryAction(tenantSlug, input))
}

export function archiveCategory(tenantSlug: string, input: ArchiveCategoryInput): Promise<ActionResult<ExpenseCategory>> {
  return runAction(() => archiveCategoryAction(tenantSlug, input))
}

export function saveSupplier(tenantSlug: string, input: SupplierSaveInput): Promise<ActionResult<Supplier>> {
  return runAction(() => saveSupplierAction(tenantSlug, input))
}
