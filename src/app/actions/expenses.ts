'use server'

/**
 * The expense book's server actions (contract §8).
 *
 * Each one: parse the input (zod, validation.ts) → resolve the store from its
 * slug → `verifyTenantPermission(tenant, 'expenses')` → write through the
 * CALLER's cookie session (RLS and the guard triggers are the boundary; the
 * service asserts affected rows because RLS refusals are silent) → refresh the
 * expense book. `revalidatePath` also re-renders the route the action was
 * called from, which is the book itself.
 *
 * No `export type` here: a type re-export from a 'use server' file passes dev
 * and tsc but breaks `next build`. Types live in @/lib/expenses.
 */

import { revalidatePath } from 'next/cache'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { z } from 'zod'
import { verifyTenantPermission } from '@/lib/admin-service'
import { SubscriptionPausedError } from '@/lib/billing/subscription-gate'
import { getCachedTenantBySlug } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { resolveExpenseActor } from '@/lib/expenses/actor'
import { EXPENSE_MESSAGES, isExpenseSentence } from '@/lib/expenses/errors'
import {
  archiveCategory,
  recordExpense,
  replaceExpense,
  saveCategory,
  saveSupplier,
  sortDrawerPayout,
  updateExpenseDetails,
  voidExpense,
} from '@/lib/expenses/expense-service'
import type { ActionResult, Expense, ExpenseCategory, Supplier } from '@/lib/expenses/types'
import {
  archiveCategorySchema,
  categorySaveSchema,
  expenseDetailsUpdateSchema,
  expenseDraftSchema,
  firstIssueMessage,
  replaceExpenseSchema,
  sortDrawerPayoutSchema,
  supplierSaveSchema,
  voidExpenseSchema,
} from '@/lib/expenses/validation'

interface ExpenseActionContext {
  tenantId: string
  db: SupabaseClient
  user: User
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i

function expensesPath(tenantSlug: string): string {
  return `/${encodeURIComponent(tenantSlug)}/admin/expenses`
}

function failure<T>(error: string): ActionResult<T> {
  return { ok: false, error }
}

/** The store and a caller who holds `expenses` on it, or the sentence to show. */
async function authorize(tenantSlug: string): Promise<{ tenantId: string; user: User } | { error: string }> {
  if (!SLUG_RE.test(tenantSlug)) return { error: 'This store could not be found.' }
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) return { error: 'This store could not be found.' }
  try {
    const { user } = await verifyTenantPermission(tenant.id, 'expenses')
    return { tenantId: tenant.id, user: user as User }
  } catch (error) {
    if (error instanceof SubscriptionPausedError) return { error: error.message }
    return { error: EXPENSE_MESSAGES.noAccess }
  }
}

async function runExpenseAction<S extends z.ZodType, T>(
  tenantSlug: string,
  input: unknown,
  schema: S,
  label: string,
  work: (context: ExpenseActionContext, parsed: z.output<S>) => Promise<T>,
  { shouldRevalidate = true }: { shouldRevalidate?: boolean } = {},
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return failure(firstIssueMessage(parsed.error))

  try {
    const caller = await authorize(tenantSlug)
    if ('error' in caller) return failure(caller.error)
    const db = (await createClient()) as unknown as SupabaseClient
    const data = await work({ tenantId: caller.tenantId, db, user: caller.user }, parsed.data as z.output<S>)
    if (shouldRevalidate) revalidatePath(expensesPath(tenantSlug))
    return { ok: true, data }
  } catch (error) {
    // Service errors already carry a sentence for the owner (errors.ts);
    // anything else is logged here and shown as the generic sentence.
    const message = error instanceof Error ? error.message : ''
    console.error(`[expenses] ${label}:`, error instanceof Error ? error.message : error)
    return failure(isExpenseSentence(message) ? message : EXPENSE_MESSAGES.unknown)
  }
}

/** Records a non-drawer expense; a repeated `clientRequestId` returns the first one. */
export async function recordExpenseAction(tenantSlug: string, input: unknown): Promise<ActionResult<Expense>> {
  return runExpenseAction(tenantSlug, input, expenseDraftSchema, 'record', async ({ tenantId, db, user }, draft) =>
    recordExpense(db, tenantId, draft, await resolveExpenseActor(db, user)),
  )
}

export async function voidExpenseAction(tenantSlug: string, input: unknown): Promise<ActionResult<null>> {
  return runExpenseAction(tenantSlug, input, voidExpenseSchema, 'void', async ({ db, user }, request) => {
    await voidExpense(db, request, await resolveExpenseActor(db, user))
    return null
  })
}

/** Voids the expense and records a corrected copy; answers the new expense's id. */
export async function replaceExpenseAction(tenantSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runExpenseAction(tenantSlug, input, replaceExpenseSchema, 'replace', async ({ db }, request) => ({
    id: await replaceExpense(db, request),
  }))
}

/**
 * The same fix, one row of a bulk "Change category". It does NOT refresh the
 * book: re-rendering the page once per row is slow and makes the list jump,
 * so the screen refreshes once when the batch is done.
 */
export async function replaceExpenseInBulkAction(tenantSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runExpenseAction(
    tenantSlug,
    input,
    replaceExpenseSchema,
    'bulk replace',
    async ({ db }, request) => ({ id: await replaceExpense(db, request) }),
    { shouldRevalidate: false },
  )
}

export async function updateExpenseDetailsAction(tenantSlug: string, input: unknown): Promise<ActionResult<Expense>> {
  return runExpenseAction(tenantSlug, input, expenseDetailsUpdateSchema, 'update details', ({ tenantId, db }, update) =>
    updateExpenseDetails(db, tenantId, update),
  )
}

/** Files a pay-out recorded without a category; answers the new expense's id. */
export async function sortDrawerPayoutAction(tenantSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runExpenseAction(tenantSlug, input, sortDrawerPayoutSchema, 'sort pay-out', async ({ db, user }, request) => ({
    id: await sortDrawerPayout(db, request, await resolveExpenseActor(db, user)),
  }))
}

export async function saveCategoryAction(tenantSlug: string, input: unknown): Promise<ActionResult<ExpenseCategory>> {
  return runExpenseAction(tenantSlug, input, categorySaveSchema, 'save category', ({ tenantId, db }, category) =>
    saveCategory(db, tenantId, category),
  )
}

/** Archives a category (`archived: false` restores it). Categories are never deleted. */
export async function archiveCategoryAction(tenantSlug: string, input: unknown): Promise<ActionResult<ExpenseCategory>> {
  return runExpenseAction(tenantSlug, input, archiveCategorySchema, 'archive category', ({ tenantId, db }, request) =>
    archiveCategory(db, tenantId, request),
  )
}

export async function saveSupplierAction(tenantSlug: string, input: unknown): Promise<ActionResult<Supplier>> {
  return runExpenseAction(tenantSlug, input, supplierSaveSchema, 'save supplier', ({ tenantId, db }, supplier) =>
    saveSupplier(db, tenantId, supplier),
  )
}
