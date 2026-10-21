/**
 * Expenses — reads, through the CALLER's session client only.
 *
 * RLS decides what comes back: an `expenses` holder sees the branches they can
 * reach; a cashier without the key sees only the drawer expenses they recorded.
 * Never pass a service-role client here — it would hand every branch's book to
 * whoever asked.
 *
 * Every list is paged past PostgREST's 1000-row cap and bounded: a window is at
 * most 400 days (validation.ts), and a result set at most MAX_EXPENSE_ROWS.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPages, type PageRequest } from '@/lib/storefront/paged-select'
import { EXPENSE_MESSAGES, toExpenseError } from '../errors'
import { addDays } from '../manila-date'
import {
  CATEGORY_COLUMNS,
  EXPENSE_COLUMNS,
  EXPENSE_WITH_RECEIPT_COUNT,
  MOVEMENT_COLUMNS,
  RECEIPT_COLUMNS,
  SUPPLIER_COLUMNS,
  toExpense,
  toExpenseCategory,
  toExpenseReceipt,
  toSupplier,
  toUnsortedPayout,
  type ExpenseCategoryRow,
  type ExpenseReceipt,
  type ExpenseReceiptRow,
  type ExpenseRow,
  type ShiftCashMovementRow,
  type SupplierRow,
} from '../rows'
import type { Expense, ExpenseCategory, ExpenseStatus, PaidFrom, Supplier, UnsortedPayout } from '../types'
import { dateWindowSchema, expenseListFilterSchema, firstIssueMessage } from '../validation'

/** The expense tables are not in the generated `Database` types yet; reads are untyped. */
export type ExpenseDb = SupabaseClient

/** A 400-day book of a busy store fits; anything past this is read in part, flagged. */
export const MAX_EXPENSE_ROWS = 20_000
/** A version chain longer than this is a bug, not a history. */
const MAX_HISTORY_HOPS = 20
const MANILA_OFFSET = '+08:00'

export interface ExpenseListQuery {
  tenantId: string
  from: string
  to: string
  /** undefined = every branch the caller reaches; null = store-wide expenses only. */
  outletId?: string | null
  categoryId?: string
  paidFrom?: PaidFrom
  /** Defaults to `recorded`. */
  status?: ExpenseStatus | 'all'
  search?: string
}

export interface ExpenseList {
  expenses: Expense[]
  /** True when the window held more than MAX_EXPENSE_ROWS; the rest were not read. */
  isTruncated: boolean
}

export interface ExpenseDetail {
  expense: Expense
  receipts: ExpenseReceipt[]
  /** Every other version in this expense's replace chain, newest first. */
  history: Expense[]
}

interface ReadResult<T> {
  data: T | null
  error: { code?: string; message: string } | null
}

/** `[from 00:00, to+1 00:00)` in Manila, as UTC instants for a timestamptz column. */
export function manilaWindowInstants(from: string, to: string): { start: string; end: string } {
  const instant = (date: string) => new Date(`${date}T00:00:00${MANILA_OFFSET}`).toISOString()
  return { start: instant(from), end: instant(addDays(to, 1)) }
}

/** Characters that would break a PostgREST `or=(…)` filter or widen an ILIKE. */
function searchTerm(raw: string | undefined): string | null {
  const term = (raw ?? '').replace(/[,()%*\\:"']/g, ' ').replace(/\s+/g, ' ').trim()
  return term.length === 0 ? null : term
}

function invalid(message: string): Error {
  return new Error(message)
}

// ---------------------------------------------------------------------------
// The expense book
// ---------------------------------------------------------------------------

export async function listExpenses(db: ExpenseDb, query: ExpenseListQuery): Promise<ExpenseList> {
  const filter = expenseListFilterSchema.safeParse(query)
  if (!filter.success) throw invalid(firstIssueMessage(filter.error))
  const status = query.status ?? 'recorded'
  const term = searchTerm(query.search)

  const page = ({ from, to, withCount }: PageRequest) => {
    let builder = db
      .from('expenses')
      .select(EXPENSE_WITH_RECEIPT_COUNT, withCount ? { count: 'exact' } : {})
      .eq('tenant_id', query.tenantId)
      .gte('spent_on', query.from)
      .lte('spent_on', query.to)
    if (status !== 'all') builder = builder.eq('status', status)
    if (query.outletId === null) builder = builder.is('outlet_id', null)
    else if (query.outletId) builder = builder.eq('outlet_id', query.outletId)
    if (query.categoryId) builder = builder.eq('category_id', query.categoryId)
    if (query.paidFrom) builder = builder.eq('paid_from', query.paidFrom)
    if (term) {
      builder = builder.or(`note.ilike.*${term}*,paid_to_name.ilike.*${term}*,invoice_no.ilike.*${term}*,created_by_name.ilike.*${term}*`)
    }
    return builder
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to) as unknown as PromiseLike<{ data: ExpenseRow[] | null; error: { message: string } | null; count?: number | null }>
  }

  const result = await selectAllPages<ExpenseRow>(page, { maxRows: MAX_EXPENSE_ROWS, label: 'expenses' })
  if (result.error) throw toExpenseError('list expenses', result.error, EXPENSE_MESSAGES.readFailed)
  return { expenses: result.data.map((row) => toExpense(row)), isTruncated: result.isTruncated }
}

async function readExpenseRow(db: ExpenseDb, tenantId: string, id: string): Promise<ExpenseRow | null> {
  const { data, error } = (await db
    .from('expenses')
    .select(EXPENSE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()) as ReadResult<ExpenseRow>
  if (error) throw toExpenseError('read expense', error, EXPENSE_MESSAGES.readFailed)
  return data
}

async function readReplacement(db: ExpenseDb, tenantId: string, id: string): Promise<ExpenseRow | null> {
  const { data, error } = (await db
    .from('expenses')
    .select(EXPENSE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('replaces_expense_id', id)
    .order('created_at', { ascending: false })
    .limit(1)) as ReadResult<ExpenseRow[]>
  if (error) throw toExpenseError('read replacement', error, EXPENSE_MESSAGES.readFailed)
  return data?.[0] ?? null
}

/** Older versions (what this one replaced) and newer ones (what replaced it), bounded. */
async function readHistory(db: ExpenseDb, tenantId: string, current: ExpenseRow): Promise<ExpenseRow[]> {
  const older: ExpenseRow[] = []
  let previousId = current.replaces_expense_id
  while (previousId && older.length < MAX_HISTORY_HOPS) {
    const row = await readExpenseRow(db, tenantId, previousId)
    if (!row) break
    older.push(row)
    previousId = row.replaces_expense_id
  }
  const newer: ExpenseRow[] = []
  let nextOf = current.id
  while (newer.length < MAX_HISTORY_HOPS) {
    const row = await readReplacement(db, tenantId, nextOf)
    if (!row) break
    newer.unshift(row)
    nextOf = row.id
  }
  return [...newer, ...older]
}

async function readReceipts(db: ExpenseDb, tenantId: string, expenseId: string): Promise<ExpenseReceipt[]> {
  const { data, error } = (await db
    .from('expense_receipts')
    .select(RECEIPT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: true })
    .limit(100)) as ReadResult<ExpenseReceiptRow[]>
  if (error) throw toExpenseError('read receipts', error, EXPENSE_MESSAGES.readFailed)
  return (data ?? []).map(toExpenseReceipt)
}

/** One expense with its receipts and replace history; null when RLS hides it or it does not exist. */
export async function getExpense(db: ExpenseDb, tenantId: string, id: string): Promise<ExpenseDetail | null> {
  const row = await readExpenseRow(db, tenantId, id)
  if (!row) return null
  const [receipts, history] = await Promise.all([readReceipts(db, tenantId, id), readHistory(db, tenantId, row)])
  return { expense: toExpense(row, receipts.length), receipts, history: history.map((version) => toExpense(version)) }
}

// ---------------------------------------------------------------------------
// Categories and suppliers
// ---------------------------------------------------------------------------

async function readCategories(db: ExpenseDb, tenantId: string): Promise<ExpenseCategoryRow[]> {
  const result = await selectAllPages<ExpenseCategoryRow>(
    ({ from, to, withCount }) =>
      db
        .from('expense_categories')
        .select(CATEGORY_COLUMNS, withCount ? { count: 'exact' } : {})
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: ExpenseCategoryRow[] | null; error: { message: string } | null }>,
    { label: 'expense categories' },
  )
  if (result.error) throw toExpenseError('list categories', result.error, EXPENSE_MESSAGES.readFailed)
  return result.data
}

/**
 * The store's categories, archived ones included (old expenses still name
 * them). A store with none yet is seeded once with the default list.
 */
export async function listCategories(db: ExpenseDb, tenantId: string): Promise<ExpenseCategory[]> {
  let rows = await readCategories(db, tenantId)
  if (rows.length === 0) {
    const { error } = await db.rpc('ensure_expense_categories', { p_tenant_id: tenantId })
    if (error) throw toExpenseError('seed categories', error)
    rows = await readCategories(db, tenantId)
  }
  return rows.map(toExpenseCategory)
}

/** Suppliers ("Paid to"), archived ones included, by name. */
export async function listSuppliers(db: ExpenseDb, tenantId: string): Promise<Supplier[]> {
  const result = await selectAllPages<SupplierRow>(
    ({ from, to, withCount }) =>
      db
        .from('suppliers')
        .select(SUPPLIER_COLUMNS, withCount ? { count: 'exact' } : {})
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: SupplierRow[] | null; error: { message: string } | null }>,
    { label: 'suppliers' },
  )
  if (result.error) throw toExpenseError('list suppliers', result.error, EXPENSE_MESSAGES.readFailed)
  return result.data.map(toSupplier)
}

// ---------------------------------------------------------------------------
// Drawer pay-outs nobody sorted
// ---------------------------------------------------------------------------

type MovementRow = Pick<ShiftCashMovementRow, 'id' | 'shift_id' | 'outlet_id' | 'amount' | 'reason' | 'recorded_by_name' | 'created_at'>

/**
 * Drawer pay-outs in the window with NO expense of any status linked — what
 * older app builds paid out without a category. A voided drawer expense's
 * pay-out is not unsorted: the void put the cash back, or a replacement
 * re-filed it (contract §10). Two bounded reads, diffed here: the pay-outs by
 * `created_at`, and the drawer expenses by `spent_on` (which the link trigger
 * forces to the Manila date of the pay-out, so the windows match).
 */
export async function listUnsortedPayouts(db: ExpenseDb, tenantId: string, from: string, to: string): Promise<UnsortedPayout[]> {
  const window = dateWindowSchema.safeParse({ from, to })
  if (!window.success) throw invalid(firstIssueMessage(window.error))
  const { start, end } = manilaWindowInstants(from, to)

  const [movements, linked] = await Promise.all([
    selectAllPages<MovementRow>(
      ({ from: first, to: last, withCount }) =>
        db
          .from('shift_cash_movements')
          .select(MOVEMENT_COLUMNS, withCount ? { count: 'exact' } : {})
          .eq('tenant_id', tenantId)
          .eq('kind', 'pay_out')
          .gte('created_at', start)
          .lt('created_at', end)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(first, last) as unknown as PromiseLike<{ data: MovementRow[] | null; error: { message: string } | null }>,
      { maxRows: MAX_EXPENSE_ROWS, label: 'drawer pay-outs' },
    ),
    selectAllPages<{ id: string; shift_cash_movement_id: string | null }>(
      ({ from: first, to: last, withCount }) =>
        db
          .from('expenses')
          .select('id, shift_cash_movement_id', withCount ? { count: 'exact' } : {})
          .eq('tenant_id', tenantId)
          .eq('paid_from', 'drawer')
          .gte('spent_on', from)
          .lte('spent_on', to)
          .order('id', { ascending: true })
          .range(first, last) as unknown as PromiseLike<{
          data: Array<{ id: string; shift_cash_movement_id: string | null }> | null
          error: { message: string } | null
        }>,
      { maxRows: MAX_EXPENSE_ROWS, label: 'drawer expenses' },
    ),
  ])
  if (movements.error) throw toExpenseError('list pay-outs', movements.error, EXPENSE_MESSAGES.readFailed)
  if (linked.error) throw toExpenseError('list drawer expenses', linked.error, EXPENSE_MESSAGES.readFailed)

  const sorted = new Set(linked.data.map((row) => row.shift_cash_movement_id).filter((id): id is string => Boolean(id)))
  return movements.data.filter((row) => !sorted.has(row.id)).map(toUnsortedPayout)
}
