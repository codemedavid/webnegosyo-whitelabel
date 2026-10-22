/**
 * Bills to pay — reads, through the CALLER's session client only.
 *
 * RLS decides what comes back (bills-contract §2): an `expenses` holder sees
 * the bills of the branches they reach; a branch-locked account never sees a
 * store-wide bill; everyone else sees nothing. Never pass a service-role
 * client here — it would hand every branch's rent and payroll to whoever asked.
 *
 * Bills are few, but every list is still paged past PostgREST's 1000-row cap
 * and bounded; marks and payments are read for a due-date window (≤ 400 days).
 * Rows ⇄ domain objects live here too, so the service maps writes the same way.
 */

import { selectAllPages, type PageRequest } from '@/lib/storefront/paged-select'
import { ruleFromColumns, type Bill, type BillMark, type BillPaidFrom, type BillPayment, type BillStatus } from '../bill-schedule'
import { EXPENSE_MESSAGES, toExpenseError } from '../errors'
import { addDays } from '../manila-date'
import type { ExpenseDb } from '../read/expenses-read'
import { toInt } from '../rows'
import { firstIssueMessage } from '../validation'
import { billWindowSchema } from './validation'

/** A branch id is only ever put in a filter string once it is a plain uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A store has a handful of bills; past this something is wrong, and it is flagged. */
export const MAX_BILL_ROWS = 2_000
/** Marks and payments in one window (a few per bill per month). */
export const MAX_BILL_EVENT_ROWS = 10_000
/** How far back payments are read for the board: the late lookback plus room for the estimate's last 3. */
export const BILL_HISTORY_DAYS = 120
/** How far ahead marks are read for the board (the engine lists due dates up to a month ahead). */
export const BILL_LOOKAHEAD_DAYS = 62

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

type Int = number | string

export interface ExpenseBillRow {
  id: string
  tenant_id: string
  outlet_id: string | null
  name: string
  category_id: string
  supplier_id: string | null
  paid_to_name: string | null
  paid_from: string
  amount_cents: Int | null
  repeat_kind: string
  repeat_every: number
  repeat_days: number[] | null
  repeat_weekday: number | null
  starts_on: string
  ends_on: string | null
  remind_days_before: number
  status: string
  paused_until: string | null
  created_at: string
}

export interface ExpenseBillMarkRow {
  bill_id: string
  due_on: string
  kind: string
  snoozed_until: string | null
}

export interface BillPaymentRow {
  id: string
  bill_id: string | null
  bill_due_on: string | null
  amount_cents: Int
  spent_on: string
}

export const BILL_COLUMNS = [
  'id', 'tenant_id', 'outlet_id', 'name', 'category_id', 'supplier_id', 'paid_to_name', 'paid_from', 'amount_cents',
  'repeat_kind', 'repeat_every', 'repeat_days', 'repeat_weekday', 'starts_on', 'ends_on', 'remind_days_before',
  'status', 'paused_until', 'created_at',
].join(', ')

export const BILL_MARK_COLUMNS = 'bill_id, due_on, kind, snoozed_until'

export const BILL_PAYMENT_COLUMNS = 'id, bill_id, bill_due_on, amount_cents, spent_on'

export function toBill(row: ExpenseBillRow): Bill {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outletId: row.outlet_id ?? null,
    name: row.name,
    categoryId: row.category_id,
    supplierId: row.supplier_id ?? null,
    paidToName: row.paid_to_name ?? null,
    paidFrom: row.paid_from as BillPaidFrom,
    amountCents: row.amount_cents === null || row.amount_cents === undefined ? null : toInt(row.amount_cents),
    // Throws on a row the shape CHECK should never have let in.
    rule: ruleFromColumns({
      repeat_kind: row.repeat_kind,
      repeat_every: toInt(row.repeat_every),
      repeat_days: row.repeat_days === null ? null : row.repeat_days.map((day) => toInt(day)),
      repeat_weekday: row.repeat_weekday === null ? null : toInt(row.repeat_weekday),
    }),
    startsOn: row.starts_on,
    endsOn: row.ends_on ?? null,
    remindDaysBefore: toInt(row.remind_days_before),
    status: row.status as BillStatus,
    pausedUntil: row.paused_until ?? null,
    createdAt: row.created_at,
  }
}

export function toBillMark(row: ExpenseBillMarkRow): BillMark {
  return {
    billId: row.bill_id,
    dueOn: row.due_on,
    kind: row.kind === 'snoozed' ? 'snoozed' : 'skipped',
    snoozedUntil: row.snoozed_until ?? null,
  }
}

/** A recorded expense linked to a bill; null for a row without a link. */
export function toBillPayment(row: BillPaymentRow): BillPayment | null {
  if (!row.bill_id || !row.bill_due_on) return null
  return {
    billId: row.bill_id,
    dueOn: row.bill_due_on,
    expenseId: row.id,
    amountCents: toInt(row.amount_cents),
    spentOn: row.spent_on,
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>

export interface BillListQuery {
  tenantId: string
  /** undefined = every bill the caller reaches; null = store-wide bills only; a uuid = that branch. */
  outletId?: string | null
}

export interface BillWindowQuery {
  tenantId: string
  /** Due dates from (inclusive), Manila. */
  from: string
  /** Due dates to (inclusive), Manila. */
  to: string
}

function checkWindow(query: BillWindowQuery): void {
  const parsed = billWindowSchema.safeParse({ from: query.from, to: query.to })
  if (!parsed.success) throw new Error(firstIssueMessage(parsed.error))
}

/** Every bill the caller may see (any status), by name. */
export async function listBills(db: ExpenseDb, query: BillListQuery): Promise<Bill[]> {
  const page = ({ from, to, withCount }: PageRequest) => {
    let builder = db
      .from('expense_bills')
      .select(BILL_COLUMNS, withCount ? { count: 'exact' } : {})
      .eq('tenant_id', query.tenantId)
    if (query.outletId === null) builder = builder.is('outlet_id', null)
    // A branch sees its own bills AND the whole store's (rent paid for every branch).
    else if (query.outletId && UUID.test(query.outletId)) builder = builder.or(`outlet_id.eq.${query.outletId},outlet_id.is.null`)
    return builder.order('name', { ascending: true }).order('id', { ascending: true }).range(from, to) as unknown as Page<ExpenseBillRow>
  }
  const result = await selectAllPages<ExpenseBillRow>(page, { maxRows: MAX_BILL_ROWS, label: 'expense_bills' })
  if (result.error) throw toExpenseError('list bills', result.error, EXPENSE_MESSAGES.billsReadFailed)
  return result.data.map(toBill)
}

/** One bill, or null when it is gone or out of the caller's reach. */
export async function getBill(db: ExpenseDb, tenantId: string, billId: string): Promise<Bill | null> {
  const { data, error } = (await db
    .from('expense_bills')
    .select(BILL_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', billId)
    .maybeSingle()) as { data: ExpenseBillRow | null; error: { code?: string; message: string } | null }
  if (error) throw toExpenseError('read bill', error, EXPENSE_MESSAGES.billsReadFailed)
  return data ? toBill(data) : null
}

/** "Nothing to pay" / "Remind me tomorrow" marks with a due date in the window. */
export async function listBillMarks(db: ExpenseDb, query: BillWindowQuery): Promise<BillMark[]> {
  checkWindow(query)
  const page = ({ from, to, withCount }: PageRequest) =>
    db
      .from('expense_bill_marks')
      .select(`id, ${BILL_MARK_COLUMNS}`, withCount ? { count: 'exact' } : {})
      .eq('tenant_id', query.tenantId)
      .gte('due_on', query.from)
      .lte('due_on', query.to)
      .order('due_on', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as Page<ExpenseBillMarkRow & { id: string }>
  const result = await selectAllPages(page, { maxRows: MAX_BILL_EVENT_ROWS, label: 'expense_bill_marks' })
  if (result.error) throw toExpenseError('list bill marks', result.error, EXPENSE_MESSAGES.billsReadFailed)
  return result.data.map(toBillMark)
}

/**
 * Recorded expenses that pay a bill, for due dates in the window. Only
 * recorded rows count: a voided payment frees its due date again.
 */
export async function listBillPayments(db: ExpenseDb, query: BillWindowQuery): Promise<BillPayment[]> {
  checkWindow(query)
  const page = ({ from, to, withCount }: PageRequest) =>
    db
      .from('expenses')
      .select(BILL_PAYMENT_COLUMNS, withCount ? { count: 'exact' } : {})
      .eq('tenant_id', query.tenantId)
      .eq('status', 'recorded')
      .not('bill_id', 'is', null)
      .gte('bill_due_on', query.from)
      .lte('bill_due_on', query.to)
      .order('bill_due_on', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as Page<BillPaymentRow>
  const result = await selectAllPages(page, { maxRows: MAX_BILL_EVENT_ROWS, label: 'bill payments' })
  if (result.error) throw toExpenseError('list bill payments', result.error, EXPENSE_MESSAGES.billsReadFailed)
  return result.data.flatMap((row) => {
    const payment = toBillPayment(row)
    return payment ? [payment] : []
  })
}

export interface BillBoard {
  bills: Bill[]
  marks: BillMark[]
  payments: BillPayment[]
}

/**
 * Everything the "Bills to pay" screen needs for `today` (Manila): the bills,
 * plus the marks and payments of due dates from BILL_HISTORY_DAYS back to
 * BILL_LOOKAHEAD_DAYS ahead. Feed it to the engine's `billsDue`.
 */
export async function readBillBoard(db: ExpenseDb, tenantId: string, today: string, outletId?: string | null): Promise<BillBoard> {
  const window = { tenantId, from: addDays(today, -BILL_HISTORY_DAYS), to: addDays(today, BILL_LOOKAHEAD_DAYS) }
  const [bills, marks, payments] = await Promise.all([
    listBills(db, { tenantId, outletId }),
    listBillMarks(db, window),
    listBillPayments(db, window),
  ])
  const billIds = new Set(bills.map((bill) => bill.id))
  return {
    bills,
    marks: marks.filter((mark) => billIds.has(mark.billId)),
    payments: payments.filter((payment) => billIds.has(payment.billId)),
  }
}
