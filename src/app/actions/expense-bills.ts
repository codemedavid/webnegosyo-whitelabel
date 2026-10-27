'use server'

/**
 * "Bills to pay" server actions (docs/plans/expenses/bills-contract.md §4).
 *
 * Same shape as the expense book's actions (actions/expenses.ts): parse the
 * input (zod) → resolve the store from its slug → `verifyTenantPermission(
 * tenant, 'expenses')` → write through the CALLER's cookie session (RLS and the
 * bill triggers are the boundary; the service asserts affected rows) → refresh
 * the expense pages. Paying a bill is `recordExpenseAction` with `billId` +
 * `billDueOn`; nothing here writes money.
 *
 * No `export type` here: a type re-export from a 'use server' file passes dev
 * and tsc but breaks `next build`.
 */

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import { verifyTenantPermission } from '@/lib/admin-service'
import { SubscriptionPausedError } from '@/lib/billing/subscription-gate'
import { getCachedTenantBySlug } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import type { Bill, BillMark } from '@/lib/expenses/bill-schedule'
import {
  createBill,
  endBill,
  linkExpenseToBill,
  markBill,
  pauseBill,
  resumeBill,
  unlinkExpenseFromBill,
  unmarkBill,
  updateBill,
} from '@/lib/expenses/bills/bills-service'
import {
  billDraftSchema,
  billIdSchema,
  billLinkSchema,
  billMarkSchema,
  billPauseSchema,
  billUnlinkSchema,
  billUnmarkSchema,
  billUpdateSchema,
} from '@/lib/expenses/bills/validation'
import { EXPENSE_MESSAGES, isExpenseSentence } from '@/lib/expenses/errors'
import type { ActionResult, Expense } from '@/lib/expenses/types'
import { firstIssueMessage } from '@/lib/expenses/validation'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i
const STORE_NOT_FOUND = 'This store could not be found.'

function expensesPath(tenantSlug: string): string {
  return `/${encodeURIComponent(tenantSlug)}/admin/expenses`
}

/** The store and its id, for a caller who holds `expenses` on it, or the sentence to show. */
async function authorize(tenantSlug: string): Promise<{ tenantId: string } | { error: string }> {
  if (!SLUG_RE.test(tenantSlug)) return { error: STORE_NOT_FOUND }
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) return { error: STORE_NOT_FOUND }
  try {
    await verifyTenantPermission(tenant.id, 'expenses')
    return { tenantId: tenant.id }
  } catch (error) {
    if (error instanceof SubscriptionPausedError) return { error: error.message }
    return { error: EXPENSE_MESSAGES.noAccess }
  }
}

async function runBillAction<S extends z.ZodType, T>(
  tenantSlug: string,
  input: unknown,
  schema: S,
  label: string,
  work: (db: SupabaseClient, tenantId: string, parsed: z.output<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error) }

  try {
    const caller = await authorize(tenantSlug)
    if ('error' in caller) return { ok: false, error: caller.error }
    const db = (await createClient()) as unknown as SupabaseClient
    const data = await work(db, caller.tenantId, parsed.data as z.output<S>)
    revalidatePath(expensesPath(tenantSlug), 'layout')
    return { ok: true, data }
  } catch (error) {
    // Service errors already carry a sentence (errors.ts); anything else is logged and generic.
    const message = error instanceof Error ? error.message : ''
    console.error(`[expense-bills] ${label}:`, message || error)
    return { ok: false, error: isExpenseSentence(message) ? message : EXPENSE_MESSAGES.unknown }
  }
}

export async function createBillAction(tenantSlug: string, input: unknown): Promise<ActionResult<Bill>> {
  return runBillAction(tenantSlug, input, billDraftSchema, 'create', (db, tenantId, draft) => createBill(db, tenantId, draft))
}

/** Edits a bill; only its next occurrences change. */
export async function updateBillAction(tenantSlug: string, input: unknown): Promise<ActionResult<Bill>> {
  return runBillAction(tenantSlug, input, billUpdateSchema, 'update', (db, tenantId, update) => updateBill(db, tenantId, update))
}

export async function pauseBillAction(tenantSlug: string, input: unknown): Promise<ActionResult<Bill>> {
  return runBillAction(tenantSlug, input, billPauseSchema, 'pause', (db, tenantId, request) => pauseBill(db, tenantId, request))
}

export async function resumeBillAction(tenantSlug: string, input: unknown): Promise<ActionResult<Bill>> {
  return runBillAction(tenantSlug, input, billIdSchema, 'resume', (db, tenantId, request) => resumeBill(db, tenantId, request))
}

/** Stops a bill for good; its past payments stay. */
export async function endBillAction(tenantSlug: string, input: unknown): Promise<ActionResult<Bill>> {
  return runBillAction(tenantSlug, input, billIdSchema, 'end', (db, tenantId, request) => endBill(db, tenantId, request))
}

/** "Nothing to pay this time" / "Remind me tomorrow" for one due date. */
export async function markBillAction(tenantSlug: string, input: unknown): Promise<ActionResult<BillMark>> {
  return runBillAction(tenantSlug, input, billMarkSchema, 'mark', (db, tenantId, mark) => markBill(db, tenantId, mark))
}

export async function unmarkBillAction(tenantSlug: string, input: unknown): Promise<ActionResult<null>> {
  return runBillAction(tenantSlug, input, billUnmarkSchema, 'unmark', async (db, tenantId, request) => {
    await unmarkBill(db, tenantId, request)
    return null
  })
}

/** "I already recorded it": files an existing expense as one due date's payment. */
export async function linkExpenseToBillAction(tenantSlug: string, input: unknown): Promise<ActionResult<Expense>> {
  return runBillAction(tenantSlug, input, billLinkSchema, 'link', (db, tenantId, link) => linkExpenseToBill(db, tenantId, link))
}

export async function unlinkExpenseFromBillAction(tenantSlug: string, input: unknown): Promise<ActionResult<Expense>> {
  return runBillAction(tenantSlug, input, billUnlinkSchema, 'unlink', (db, tenantId, request) =>
    unlinkExpenseFromBill(db, tenantId, request),
  )
}
