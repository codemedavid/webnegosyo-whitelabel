/**
 * Bills to pay — writes, through the CALLER's session client only.
 *
 * A bill is a reminder (bills-contract §1): nothing here writes money. Paying
 * a bill is `recordExpense` with `billId` + `billDueOn` (expense-service.ts);
 * this module adds, edits, pauses and stops bills, marks one due date
 * ("Nothing to pay this time", "Remind me tomorrow"), and links an expense the
 * owner already recorded ("I already recorded it").
 *
 * RLS and the triggers are the boundary; refusals under RLS are SILENT (an
 * UPDATE that matches nothing, an INSERT … RETURNING with no row), so every
 * write asserts the rows it affected. Inputs arrive parsed by `./validation`.
 */

import { ruleToColumns, type Bill, type BillMark } from '../bill-schedule'
import { EXPENSE_MESSAGES, isUniqueViolation, toExpenseError } from '../errors'
import type { ExpenseDb } from '../read/expenses-read'
import { EXPENSE_COLUMNS, toExpense, type ExpenseRow } from '../rows'
import type { Expense } from '../types'
import {
  BILL_COLUMNS,
  BILL_MARK_COLUMNS,
  toBill,
  toBillMark,
  type ExpenseBillMarkRow,
  type ExpenseBillRow,
} from './bills-read'
import type {
  BillDraftInput,
  BillIdInput,
  BillLinkInput,
  BillMarkInput,
  BillPauseInput,
  BillUnlinkInput,
  BillUnmarkInput,
  BillUpdateInput,
} from './validation'

interface WriteResult<T> {
  data: T | null
  error: { code?: string; message: string; details?: string; hint?: string } | null
}

type Row = Record<string, unknown>

/** The columns a draft writes. Who / when / status are the database's. */
export function billDraftToRow(draft: BillDraftInput): Row {
  return {
    name: draft.name,
    category_id: draft.categoryId,
    outlet_id: draft.outletId,
    supplier_id: draft.supplierId ?? null,
    paid_to_name: draft.paidToName ?? null,
    paid_from: draft.paidFrom,
    amount_cents: draft.amountCents,
    ...ruleToColumns(draft.rule),
    starts_on: draft.startsOn,
    ends_on: draft.endsOn,
    remind_days_before: draft.remindDaysBefore,
  }
}

/** Exactly one row back, or the sentence `refusal` (RLS answered with nothing). */
function single<T>(context: string, data: T[] | null, refusal: string): T {
  if (!data || data.length !== 1) throw toExpenseError(context, { code: '42501', message: 'no row written' }, refusal)
  return data[0]
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

/** Adds a bill (active). */
export async function createBill(db: ExpenseDb, tenantId: string, draft: BillDraftInput): Promise<Bill> {
  const { data, error } = (await db
    .from('expense_bills')
    .insert({ ...billDraftToRow(draft), tenant_id: tenantId })
    .select(BILL_COLUMNS)) as WriteResult<ExpenseBillRow[]>
  if (error) throw toExpenseError('create bill', error)
  return toBill(single('create bill', data, EXPENSE_MESSAGES.noAccess))
}

async function updateBillRow(db: ExpenseDb, tenantId: string, billId: string, columns: Row, context: string): Promise<Bill> {
  const { data, error } = (await db
    .from('expense_bills')
    .update(columns)
    .eq('tenant_id', tenantId)
    .eq('id', billId)
    .select(BILL_COLUMNS)) as WriteResult<ExpenseBillRow[]>
  if (error) throw toExpenseError(context, error)
  return toBill(single(context, data, EXPENSE_MESSAGES.billGone))
}

/** Edits a bill. Only its next occurrences change; past payments are expenses and stay. */
export function updateBill(db: ExpenseDb, tenantId: string, input: BillUpdateInput): Promise<Bill> {
  return updateBillRow(db, tenantId, input.billId, billDraftToRow(input.draft), 'update bill')
}

/** Pauses a bill until a date, or until resumed by hand (no date). */
export function pauseBill(db: ExpenseDb, tenantId: string, input: BillPauseInput): Promise<Bill> {
  return updateBillRow(db, tenantId, input.billId, { status: 'paused', paused_until: input.pausedUntil ?? null }, 'pause bill')
}

export function resumeBill(db: ExpenseDb, tenantId: string, input: BillIdInput): Promise<Bill> {
  return updateBillRow(db, tenantId, input.billId, { status: 'active', paused_until: null }, 'resume bill')
}

/** Stops a bill for good. Its past payments stay; it never comes back (the database refuses). */
export function endBill(db: ExpenseDb, tenantId: string, input: BillIdInput): Promise<Bill> {
  return updateBillRow(db, tenantId, input.billId, { status: 'ended', paused_until: null }, 'end bill')
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

/**
 * "Nothing to pay this time" (skipped) or "Remind me tomorrow" (snoozed) for
 * one due date. A due date holds one mark, so an existing one is replaced
 * (re-snooze = delete + insert, bills-contract §2).
 */
export async function markBill(db: ExpenseDb, tenantId: string, input: BillMarkInput): Promise<BillMark> {
  const cleared = (await db
    .from('expense_bill_marks')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('bill_id', input.billId)
    .eq('due_on', input.dueOn)) as WriteResult<null>
  if (cleared.error) throw toExpenseError('clear bill mark', cleared.error)

  const { data, error } = (await db
    .from('expense_bill_marks')
    .insert({
      tenant_id: tenantId,
      bill_id: input.billId,
      due_on: input.dueOn,
      kind: input.kind,
      snoozed_until: input.kind === 'snoozed' ? (input.snoozedUntil ?? null) : null,
    })
    .select(BILL_MARK_COLUMNS)) as WriteResult<ExpenseBillMarkRow[]>
  if (error) throw toExpenseError('mark bill', error)
  return toBillMark(single('mark bill', data, EXPENSE_MESSAGES.billGone))
}

/** Undo a mark: the due date is open again. */
export async function unmarkBill(db: ExpenseDb, tenantId: string, input: BillUnmarkInput): Promise<void> {
  const { data, error } = (await db
    .from('expense_bill_marks')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('bill_id', input.billId)
    .eq('due_on', input.dueOn)
    .select('id')) as WriteResult<{ id: string }[]>
  if (error) throw toExpenseError('unmark bill', error)
  if (!data || data.length === 0) {
    throw toExpenseError('unmark bill', { code: 'P0002', message: 'no mark deleted' }, EXPENSE_MESSAGES.billMarkGone)
  }
}

// ---------------------------------------------------------------------------
// "I already recorded it"
// ---------------------------------------------------------------------------

async function setExpenseBill(
  db: ExpenseDb,
  tenantId: string,
  expenseId: string,
  link: { bill_id: string | null; bill_due_on: string | null },
  context: string,
): Promise<Expense> {
  const { data, error } = (await db
    .from('expenses')
    .update({ ...link, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', expenseId)
    .eq('status', 'recorded')
    .select(EXPENSE_COLUMNS)) as WriteResult<ExpenseRow[]>
  if (error && isUniqueViolation(error)) throw toExpenseError(context, error, EXPENSE_MESSAGES.billDueAlreadyPaid)
  if (error) throw toExpenseError(context, error)
  return toExpense(single(context, data, EXPENSE_MESSAGES.goneOrVoided))
}

/** Files an existing recorded expense as the payment of one due date. Money never changes. */
export function linkExpenseToBill(db: ExpenseDb, tenantId: string, input: BillLinkInput): Promise<Expense> {
  return setExpenseBill(db, tenantId, input.expenseId, { bill_id: input.billId, bill_due_on: input.dueOn }, 'link expense to bill')
}

/** Takes the bill link off an expense; the due date is open again. */
export function unlinkExpenseFromBill(db: ExpenseDb, tenantId: string, input: BillUnlinkInput): Promise<Expense> {
  return setExpenseBill(db, tenantId, input.expenseId, { bill_id: null, bill_due_on: null }, 'unlink expense from bill')
}

export { getBill, listBillMarks, listBillPayments, listBills, readBillBoard, type BillBoard } from './bills-read'
