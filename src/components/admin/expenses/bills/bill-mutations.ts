/**
 * "Bills to pay" writes, as the screens call them: one seam over
 * `src/app/actions/expense-bills.ts`, so a thrown error comes back as a
 * sentence, never an unhandled rejection in a click handler. Paying a bill is
 * NOT here: it is `recordExpense` with `billId` + `billDueOn`.
 */

import {
  createBillAction,
  endBillAction,
  linkExpenseToBillAction,
  markBillAction,
  pauseBillAction,
  resumeBillAction,
  unmarkBillAction,
  updateBillAction,
} from '@/app/actions/expense-bills'
import type { Bill, BillMark } from '@/lib/expenses/bill-schedule'
import type { ActionResult, Expense } from '@/lib/expenses/types'
import { runAction } from '../expense-mutations'
import type { BillDraftPayload } from './bill-editor-model'

export function createBill(tenantSlug: string, draft: BillDraftPayload): Promise<ActionResult<Bill>> {
  return runAction(() => createBillAction(tenantSlug, draft))
}

export function updateBill(tenantSlug: string, billId: string, draft: BillDraftPayload): Promise<ActionResult<Bill>> {
  return runAction(() => updateBillAction(tenantSlug, { billId, draft }))
}

/** `pausedUntil` null = until resumed by hand. */
export function pauseBill(tenantSlug: string, billId: string, pausedUntil: string | null): Promise<ActionResult<Bill>> {
  return runAction(() => pauseBillAction(tenantSlug, { billId, pausedUntil }))
}

export function resumeBill(tenantSlug: string, billId: string): Promise<ActionResult<Bill>> {
  return runAction(() => resumeBillAction(tenantSlug, { billId }))
}

export function endBill(tenantSlug: string, billId: string): Promise<ActionResult<Bill>> {
  return runAction(() => endBillAction(tenantSlug, { billId }))
}

export function skipBill(tenantSlug: string, billId: string, dueOn: string): Promise<ActionResult<BillMark>> {
  return runAction(() => markBillAction(tenantSlug, { billId, dueOn, kind: 'skipped' }))
}

export function snoozeBill(tenantSlug: string, billId: string, dueOn: string, snoozedUntil: string): Promise<ActionResult<BillMark>> {
  return runAction(() => markBillAction(tenantSlug, { billId, dueOn, kind: 'snoozed', snoozedUntil }))
}

export function unmarkBill(tenantSlug: string, billId: string, dueOn: string): Promise<ActionResult<null>> {
  return runAction(() => unmarkBillAction(tenantSlug, { billId, dueOn }))
}

export function linkExpenseToBill(tenantSlug: string, expenseId: string, billId: string, dueOn: string): Promise<ActionResult<Expense>> {
  return runAction(() => linkExpenseToBillAction(tenantSlug, { expenseId, billId, dueOn }))
}
