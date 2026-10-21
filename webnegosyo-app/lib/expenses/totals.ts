/**
 * Expense book totals: the month figure, the "where the money went" bars, the
 * day headers and the drawer split, all from one pass so they always agree.
 *
 * - Recorded rows only; a void row is history, never money.
 * - Integer centavos throughout. Σ by category = Σ by group = Σ by day =
 *   Σ by paid-from = total, exactly (pinned by `totals.property.test.ts`).
 * - `totalCents` is EVERY recorded peso out, including big purchases and
 *   "not an expense" moves; `operatingCents`, `capexCents` and
 *   `notExpenseCents` split it for Profit (which never subtracts not_expense).
 * - Days are the row's `spentOn`, already the Asia/Manila business date.
 * - A row whose category isn't in `categories` is filed under `other`, so a
 *   missing lookup can never make money disappear from the total.
 *
 * Copied byte-for-byte into the merchant app.
 */
import { EXPENSE_GROUPS, OPERATING_GROUPS, PAID_FROM, type Expense, type ExpenseCategory, type ExpenseGroup, type PaidFrom } from './types'

export interface CategoryTotal {
  categoryId: string
  group: ExpenseGroup
  cents: number
  count: number
}

export interface DayTotal {
  /** `YYYY-MM-DD`, Manila business date. */
  date: string
  cents: number
  count: number
}

export interface ExpenseSummary {
  count: number
  totalCents: number
  operatingCents: number
  capexCents: number
  notExpenseCents: number
  drawerCents: number
  nonDrawerCents: number
  byGroup: Record<ExpenseGroup, number>
  byPaidFrom: Record<PaidFrom, number>
  /** Largest first; ties in category sortOrder. */
  byCategory: CategoryTotal[]
  /** Oldest first. */
  byDay: DayTotal[]
}

const FALLBACK_GROUP: ExpenseGroup = 'other'

function zeroes<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>
}

function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function categoryTotals(recorded: readonly Expense[], groupOf: (categoryId: string) => ExpenseGroup): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>()
  for (const expense of recorded) {
    const previous = totals.get(expense.categoryId)
    totals.set(expense.categoryId, {
      categoryId: expense.categoryId,
      group: groupOf(expense.categoryId),
      cents: (previous?.cents ?? 0) + expense.amountCents,
      count: (previous?.count ?? 0) + 1,
    })
  }
  return [...totals.values()]
}

function dayTotals(recorded: readonly Expense[]): DayTotal[] {
  const totals = new Map<string, DayTotal>()
  for (const expense of recorded) {
    const previous = totals.get(expense.spentOn)
    totals.set(expense.spentOn, {
      date: expense.spentOn,
      cents: (previous?.cents ?? 0) + expense.amountCents,
      count: (previous?.count ?? 0) + 1,
    })
  }
  return [...totals.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export function summarize(expenses: readonly Expense[], categories: readonly ExpenseCategory[]): ExpenseSummary {
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const groupOf = (categoryId: string): ExpenseGroup => categoryById.get(categoryId)?.group ?? FALLBACK_GROUP
  const sortOrderOf = (categoryId: string): number => categoryById.get(categoryId)?.sortOrder ?? Number.MAX_SAFE_INTEGER
  const recorded = expenses.filter((expense) => expense.status === 'recorded')

  const byCategory = categoryTotals(recorded, groupOf).sort(
    (a, b) =>
      b.cents - a.cents ||
      sortOrderOf(a.categoryId) - sortOrderOf(b.categoryId) ||
      (a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0),
  )
  const byGroup = zeroes(EXPENSE_GROUPS)
  for (const category of byCategory) byGroup[category.group] += category.cents
  const byPaidFrom = zeroes(PAID_FROM)
  for (const expense of recorded) byPaidFrom[expense.paidFrom] += expense.amountCents

  const totalCents = sumOf(recorded.map((expense) => expense.amountCents))
  return {
    count: recorded.length,
    totalCents,
    operatingCents: sumOf(OPERATING_GROUPS.map((group) => byGroup[group])),
    capexCents: byGroup.capex,
    notExpenseCents: byGroup.not_expense,
    drawerCents: byPaidFrom.drawer,
    nonDrawerCents: totalCents - byPaidFrom.drawer,
    byGroup,
    byPaidFrom,
    byCategory,
    byDay: dayTotals(recorded),
  }
}
