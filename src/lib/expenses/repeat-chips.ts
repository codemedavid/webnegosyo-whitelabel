/**
 * The "↻ Ice ₱120" repeat row on the Add-expense sheet (plan §5.1): one tap
 * fills both category and amount, so a repeat expense takes three taps.
 *
 * First chip = the most recent pair; the rest = the most often used pairs
 * (ties: the more recently used). Big purchases and "not an expense" moves are
 * left out — nobody buys a chiller every week, and owner draws shouldn't be
 * one tap away. Copied byte-for-byte into the merchant app.
 */
import type { Expense, ExpenseCategory } from './types'

export const REPEAT_CHIP_LIMIT = 4

export interface RepeatSuggestion {
  categoryId: string
  categoryName: string
  icon: string | null
  amountCents: number
  timesUsed: number
  lastUsedAt: string
}

const NOT_REPEATABLE = new Set(['capex', 'not_expense'])

function isRepeatable(category: ExpenseCategory | undefined): category is ExpenseCategory {
  return category !== undefined && category.archivedAt === null && !NOT_REPEATABLE.has(category.group)
}

/** Instants compared as instants: `…Z` and `…+00:00` spell the same time. */
function instant(iso: string): number {
  const value = Date.parse(iso)
  return Number.isNaN(value) ? 0 : value
}

function byRecency(a: RepeatSuggestion, b: RepeatSuggestion): number {
  return instant(b.lastUsedAt) - instant(a.lastUsedAt)
}

function collectPairs(recentExpenses: readonly Expense[], categories: readonly ExpenseCategory[]): RepeatSuggestion[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const pairs = new Map<string, RepeatSuggestion>()
  for (const expense of recentExpenses) {
    const category = categoryById.get(expense.categoryId)
    if (expense.status !== 'recorded' || !isRepeatable(category)) continue
    const key = `${expense.categoryId}|${expense.amountCents}`
    const previous = pairs.get(key)
    pairs.set(key, {
      categoryId: category.id,
      categoryName: category.name,
      icon: category.icon,
      amountCents: expense.amountCents,
      timesUsed: (previous?.timesUsed ?? 0) + 1,
      lastUsedAt: previous && instant(previous.lastUsedAt) > instant(expense.createdAt) ? previous.lastUsedAt : expense.createdAt,
    })
  }
  return [...pairs.values()]
}

export function repeatSuggestions(
  recentExpenses: readonly Expense[],
  categories: readonly ExpenseCategory[],
  limit: number = REPEAT_CHIP_LIMIT,
): RepeatSuggestion[] {
  if (limit <= 0) return []
  const pairs = collectPairs(recentExpenses, categories)
  if (pairs.length === 0) return []
  const [latest] = [...pairs].sort(byRecency)
  const frequent = pairs
    .filter((pair) => pair !== latest)
    .sort((a, b) => b.timesUsed - a.timesUsed || byRecency(a, b))
  return [latest, ...frequent].slice(0, limit)
}
