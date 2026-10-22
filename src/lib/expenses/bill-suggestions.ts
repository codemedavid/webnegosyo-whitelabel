/**
 * "Make it a bill?" (Bills to pay, contract docs/plans/expenses/bills-contract.md §3):
 * categories the owner already pays like a bill, offered in Needs you.
 *
 * Pure; builds on `bill-schedule.ts`. Copied byte-for-byte into the merchant
 * app (`tests/unit/expenses/app-parity.test.ts`).
 */
import { monthKeyOf, roundToPeso, type Bill } from './bill-schedule'
import { addDays } from './manila-date'
import type { Expense, ExpenseCategory } from './types'

const SUGGEST_FULL_MONTHS = 3
const SUGGEST_MIN_MONTHS = 2
const SUGGEST_LIMIT = 3
/** A month counts toward a suggestion only with a bill-like rhythm (1–2 payments). */
const SUGGEST_MAX_PER_MONTH = 2
const SUGGEST_EXCLUDED_GROUPS: readonly string[] = ['ingredients', 'not_expense']

export interface BillSuggestion {
  categoryId: string
  /** Median day of the month it was paid. */
  typicalDay: number
  /** Median amount, rounded to a whole peso. */
  typicalCents: number
  monthsSeen: number
}

export type SuggestExpense = Pick<Expense, 'categoryId' | 'amountCents' | 'spentOn' | 'status'>
export type SuggestCategory = Pick<ExpenseCategory, 'id' | 'group' | 'systemKey' | 'archivedAt'>

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Day of the month of a valid `YYYY-MM-DD` date. */
const dayOfMonthOf = (date: string): number => Number(addDays(date, 0).slice(8, 10))

/** `YYYY-MM` of the full calendar months before `today`'s, newest first. */
function lastFullMonthKeys(today: string): Set<string> {
  const year = Number(addDays(today, 0).slice(0, 4))
  const month = Number(today.slice(5, 7))
  const keys = Array.from({ length: SUGGEST_FULL_MONTHS }, (_, offset) =>
    new Date(Date.UTC(year, month - 2 - offset, 1)).toISOString().slice(0, 7),
  )
  return new Set(keys)
}

interface CandidateUse {
  suggestion: BillSuggestion
  lastSpentOn: string
}

function candidateFor(categoryId: string, rows: readonly SuggestExpense[]): CandidateUse | null {
  const byMonth = new Map<string, SuggestExpense[]>()
  for (const row of rows) byMonth.set(monthKeyOf(row.spentOn), [...(byMonth.get(monthKeyOf(row.spentOn)) ?? []), row])
  const steady = [...byMonth.values()].filter((month) => month.length <= SUGGEST_MAX_PER_MONTH)
  if (steady.length < SUGGEST_MIN_MONTHS) return null
  const counted = steady.flat()
  return {
    suggestion: {
      categoryId,
      typicalDay: Math.round(median(counted.map((row) => dayOfMonthOf(row.spentOn)))),
      typicalCents: roundToPeso(median(counted.map((row) => row.amountCents))),
      monthsSeen: steady.length,
    },
    lastSpentOn: counted.reduce((latest, row) => (row.spentOn > latest ? row.spentOn : latest), counted[0].spentOn),
  }
}

/**
 * Categories that look like a bill: a recorded expense in ≥2 of the last 3 full
 * calendar months (a month with more than 2 is spending, not a bill), not an
 * ingredients / "not an expense" category, and no active or paused bill on it.
 * Newest first, at most 3.
 */
export function suggestBills(
  expenses: readonly SuggestExpense[],
  categories: readonly SuggestCategory[],
  bills: readonly Pick<Bill, 'categoryId' | 'status'>[],
  today: string,
): BillSuggestion[] {
  const months = lastFullMonthKeys(today)
  const billed = new Set(bills.filter((bill) => bill.status !== 'ended').map((bill) => bill.categoryId))
  const eligible = new Set(
    categories
      .filter((c) => c.archivedAt === null && !SUGGEST_EXCLUDED_GROUPS.includes(c.group) && !billed.has(c.id))
      .map((c) => c.id),
  )
  const byCategory = new Map<string, SuggestExpense[]>()
  for (const row of expenses) {
    if (row.status !== 'recorded' || !eligible.has(row.categoryId) || !months.has(monthKeyOf(row.spentOn))) continue
    byCategory.set(row.categoryId, [...(byCategory.get(row.categoryId) ?? []), row])
  }
  return [...byCategory.entries()]
    .map(([categoryId, rows]) => candidateFor(categoryId, rows))
    .filter((candidate): candidate is CandidateUse => candidate !== null)
    .sort((a, b) => b.lastSpentOn.localeCompare(a.lastSpentOn) || a.suggestion.categoryId.localeCompare(b.suggestion.categoryId))
    .slice(0, SUGGEST_LIMIT)
    .map((candidate) => candidate.suggestion)
}
