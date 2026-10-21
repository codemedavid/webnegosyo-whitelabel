/**
 * What the category picker offers for what has been typed.
 *
 * Browsing: the most used first (`rankCategoriesForPicker`), then every group
 * in P&L order under its owner-facing name (`GROUP_LABELS`). Typing "kur"
 * finds "Electricity (Kuryente)": the Filipino word in brackets counts, and a
 * match at the start of a word ranks above one inside a word.
 */

import { GROUP_LABELS, rankCategoriesForPicker, sortCategories } from '@/lib/expenses/categories'
import { EXPENSE_GROUPS, type Expense, type ExpenseCategory } from '@/lib/expenses/types'

/** How many "Most used" rows the web picker leads with. */
export const MOST_USED_COUNT = 6

export interface CategorySection {
  id: string
  label: string
  categories: ExpenseCategory[]
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** 2 = a word starts with the query, 1 = contained, 0 = no match. */
export function matchScore(name: string, query: string): number {
  const needle = fold(query.trim())
  if (needle === '') return 1
  const haystack = fold(name)
  if (!haystack.includes(needle)) return 0
  const words = haystack.split(/[^a-z0-9]+/).filter(Boolean)
  return haystack.startsWith(needle) || words.some((word) => word.startsWith(needle)) ? 2 : 1
}

export function categorySections(
  categories: readonly ExpenseCategory[],
  recentExpenses: readonly Expense[],
  query: string,
  now: Date,
): CategorySection[] {
  const active = categories.filter((category) => category.archivedAt === null)
  const trimmed = query.trim()

  if (trimmed === '') {
    const usedIds = new Set(recentExpenses.filter((expense) => expense.status === 'recorded').map((expense) => expense.categoryId))
    const mostUsed = rankCategoriesForPicker(active, recentExpenses, now, MOST_USED_COUNT)
      .filter((category) => usedIds.has(category.id))
      .slice(0, MOST_USED_COUNT)
    const groups = EXPENSE_GROUPS.map((group) => ({
      id: group,
      label: GROUP_LABELS[group],
      categories: sortCategories(active.filter((category) => category.group === group)),
    }))
    return [...(mostUsed.length > 0 ? [{ id: 'most-used', label: 'Most used', categories: mostUsed }] : []), ...groups].filter(
      (section) => section.categories.length > 0,
    )
  }

  const ranked = rankCategoriesForPicker(active, recentExpenses, now)
  const rankIndex = new Map(ranked.map((category, index) => [category.id, index]))
  const matches = active
    .map((category) => ({ category, score: matchScore(category.name, trimmed) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (rankIndex.get(a.category.id) ?? 0) - (rankIndex.get(b.category.id) ?? 0))
  if (matches.length === 0) return []
  // One flat, best-first list while typing: Enter takes the top row.
  return [{ id: 'matches', label: 'Matches', categories: matches.map((entry) => entry.category) }]
}
