/**
 * What the expense table shows: which rows a saved view and the filters keep,
 * how they group by day, and what each day adds up to (plan §5.4).
 *
 * Pure, so the grouping and the totals are tested without rendering.
 * Money is integer centavos. Voided rows stay visible (struck through) but
 * never count; "not an expense" kinds (owner took cash, bank deposit, loan
 * payment) are listed but never counted as spending (plan §2.1).
 */

import type { Expense, ExpenseCategory, ExpenseFlag, PaidFrom } from '@/lib/expenses/types'

export const EXPENSE_VIEWS = ['all', 'drawer', 'no_receipt', 'needs_look', 'unsorted'] as const
export type ExpenseView = (typeof EXPENSE_VIEWS)[number]

export const EXPENSE_VIEW_LABELS: Readonly<Record<ExpenseView, string>> = {
  all: 'All',
  drawer: 'Drawer pay-outs',
  no_receipt: 'No receipt',
  needs_look: 'Needs a look',
  unsorted: 'Unsorted',
}

/** Select tokens: Radix Select can't hold an empty value. */
export const ANY = '__any__'
/** Branch filter for store-wide rows (`outlet_id` NULL). */
export const WHOLE_STORE = '__store__'

export interface ExpenseFilters {
  /** A category id, or ANY. */
  categoryId: string
  /** A PaidFrom, or ANY. */
  paidFrom: PaidFrom | typeof ANY
  /** An outlet id, WHOLE_STORE, or ANY. */
  branch: string
  search: string
}

export const NO_FILTERS: ExpenseFilters = { categoryId: ANY, paidFrom: ANY, branch: ANY, search: '' }

export function hasActiveFilters(filters: ExpenseFilters): boolean {
  return (
    filters.categoryId !== ANY || filters.paidFrom !== ANY || filters.branch !== ANY || filters.search.trim() !== ''
  )
}

export type FlagsById = ReadonlyMap<string, readonly ExpenseFlag[]>

export interface ListContext {
  categoriesById: ReadonlyMap<string, ExpenseCategory>
  flagsById: FlagsById
}

/** A row counts as spending: recorded, and not one of the "not an expense" kinds. */
export function countsAsSpending(expense: Expense, categoriesById: ReadonlyMap<string, ExpenseCategory>): boolean {
  if (expense.status !== 'recorded') return false
  return categoriesById.get(expense.categoryId)?.group !== 'not_expense'
}

function digitsOnly(text: string): string {
  return text.replace(/[^\d]/g, '')
}

function matchesSearch(expense: Expense, query: string, context: ListContext): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  const category = context.categoriesById.get(expense.categoryId)?.name ?? ''
  const haystack = [expense.note, expense.paidToName, category, expense.createdByName, expense.invoiceNo]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase()
  if (haystack.includes(needle)) return true
  // "1250", "1,250" and "₱1,250" all find a ₱1,250 expense.
  const amountNeedle = digitsOnly(needle)
  if (amountNeedle === '' || amountNeedle !== needle.replace(/[₱,.\s]/g, '')) return false
  const pesos = String(Math.floor(expense.amountCents / 100))
  return pesos === amountNeedle || String(expense.amountCents) === amountNeedle
}

function matchesView(expense: Expense, view: ExpenseView, context: ListContext): boolean {
  switch (view) {
    case 'all':
      return true
    case 'drawer':
      return expense.paidFrom === 'drawer'
    case 'no_receipt':
      return expense.status === 'recorded' && expense.receiptCount === 0
    case 'needs_look':
      return expense.status === 'recorded' && (context.flagsById.get(expense.id)?.length ?? 0) > 0
    case 'unsorted':
      // Unsorted pay-outs are not expenses yet; the panel lists them instead.
      return false
  }
}

function matchesFilters(expense: Expense, filters: ExpenseFilters): boolean {
  if (filters.categoryId !== ANY && expense.categoryId !== filters.categoryId) return false
  if (filters.paidFrom !== ANY && expense.paidFrom !== filters.paidFrom) return false
  if (filters.branch === WHOLE_STORE) return expense.outletId === null
  if (filters.branch !== ANY && expense.outletId !== filters.branch) return false
  return true
}

/** The rows a view + filters keep, newest first. Returns a new array. */
export function filterExpenses(
  expenses: readonly Expense[],
  view: ExpenseView,
  filters: ExpenseFilters,
  context: ListContext,
): Expense[] {
  return expenses
    .filter(
      (expense) =>
        matchesView(expense, view, context) &&
        matchesFilters(expense, filters) &&
        matchesSearch(expense, filters.search, context),
    )
    .sort(compareNewestFirst)
}

export function compareNewestFirst(a: Expense, b: Expense): number {
  if (a.spentOn !== b.spentOn) return a.spentOn < b.spentOn ? 1 : -1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id < b.id ? 1 : -1
}

export interface DayGroup {
  day: string
  /** What the day's counted rows add up to, in centavos. */
  totalCents: number
  rows: Expense[]
}

/**
 * Rows grouped by `spent_on`, in the order given (callers pass newest first).
 * Day totals count spending only, so a struck-through void never inflates a
 * day.
 */
export function groupByDay(
  expenses: readonly Expense[],
  categoriesById: ReadonlyMap<string, ExpenseCategory>,
): DayGroup[] {
  const order: string[] = []
  const byDay = new Map<string, Expense[]>()
  for (const expense of expenses) {
    const existing = byDay.get(expense.spentOn)
    if (existing) {
      byDay.set(expense.spentOn, [...existing, expense])
    } else {
      order.push(expense.spentOn)
      byDay.set(expense.spentOn, [expense])
    }
  }
  return order.map((day) => {
    const rows = byDay.get(day) ?? []
    return { day, rows, totalCents: sumSpending(rows, categoriesById) }
  })
}

export function sumSpending(
  expenses: readonly Expense[],
  categoriesById: ReadonlyMap<string, ExpenseCategory>,
): number {
  return expenses.reduce((total, expense) => (countsAsSpending(expense, categoriesById) ? total + expense.amountCents : total), 0)
}

/** Money that left but is not spending (owner took cash, deposits, loans), recorded rows only. */
export function sumNotExpense(
  expenses: readonly Expense[],
  categoriesById: ReadonlyMap<string, ExpenseCategory>,
): number {
  return expenses.reduce(
    (total, expense) =>
      expense.status === 'recorded' && categoriesById.get(expense.categoryId)?.group === 'not_expense'
        ? total + expense.amountCents
        : total,
    0,
  )
}

/**
 * The first `limit` rows, still grouped by day. A long month renders in pages
 * so the table stays fast; a day cut in half keeps its FULL total, because a
 * day total that changes as you scroll would read as a different number.
 */
export function pageDayGroups(groups: readonly DayGroup[], limit: number): { groups: DayGroup[]; shown: number; total: number } {
  const total = groups.reduce((count, group) => count + group.rows.length, 0)
  const kept: DayGroup[] = []
  let shown = 0
  for (const group of groups) {
    if (shown >= limit) break
    const room = limit - shown
    const rows = group.rows.slice(0, room)
    kept.push({ ...group, rows })
    shown += rows.length
  }
  return { groups: kept, shown, total }
}

export function viewCounts(
  expenses: readonly Expense[],
  unsortedCount: number,
  context: ListContext,
): Record<ExpenseView, number> {
  const count = (view: ExpenseView) => expenses.filter((expense) => matchesView(expense, view, context)).length
  return {
    all: expenses.length,
    drawer: count('drawer'),
    no_receipt: count('no_receipt'),
    needs_look: count('needs_look'),
    unsorted: unsortedCount,
  }
}
