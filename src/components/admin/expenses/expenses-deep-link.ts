/**
 * The links other screens send into the expense book (Profit's trust strip):
 *
 * - `?add=1` opens Add expense; `?add=<categoryId>` opens it on that category.
 * - `?on=YYYY-MM-DD` dates that new entry (a day an expense may have, else today).
 * - `?view=unsorted` (or any saved view) opens that view.
 * - `?category=<id>` applies the category filter.
 * - `?month=YYYY-MM` picks the month (read by the page).
 *
 * Pure. Anything unknown is ignored, never an error: a stale link still opens
 * the book. `add` is one-shot and is removed from the URL once used, so a
 * refresh doesn't reopen the dialog.
 */

import { addDays } from '@/lib/expenses/manila-date'
import type { ExpenseCategory } from '@/lib/expenses/types'
import { MAX_DAYS_BACK } from '@/lib/expenses/validation'
import { ANY, EXPENSE_VIEWS, type ExpenseView } from './expense-list-model'
import type { ExpensesInitialLink } from './expenses-page-data'

type Query = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

export function readInitialLink(query: Query): ExpensesInitialLink {
  const add = first(query.add)
  return {
    add: add === null ? null : add === '1' || add === 'true' ? '' : add,
    view: first(query.view),
    categoryId: first(query.category),
    spentOn: first(query.on),
  }
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar day between MAX_DAYS_BACK ago and today (what Add accepts), else null. */
function datableDay(day: string | null, today: string): string | null {
  if (day === null || !DAY_KEY.test(day)) return null
  const parsed = new Date(`${day}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null
  return day <= today && day >= addDays(today, -MAX_DAYS_BACK) ? day : null
}

export interface ResolvedLink {
  isAddOpen: boolean
  /** Preselected in the Add dialog; null = none. */
  addCategoryId: string | null
  /** The Add dialog's starting date; null = today. */
  addSpentOn: string | null
  view: ExpenseView
  /** The category filter (ANY = none). */
  categoryFilter: string
}

function activeCategory(id: string | null, categories: readonly ExpenseCategory[]): string | null {
  if (!id) return null
  return categories.some((category) => category.id === id && category.archivedAt === null) ? id : null
}

export function resolveInitialLink(
  link: ExpensesInitialLink,
  categories: readonly ExpenseCategory[],
  options: { canAdd: boolean; canSortPayouts: boolean; today: string },
): ResolvedLink {
  const view = (EXPENSE_VIEWS as readonly string[]).includes(link.view ?? '') ? (link.view as ExpenseView) : 'all'
  const isFilterable = link.categoryId !== null && categories.some((category) => category.id === link.categoryId)
  return {
    isAddOpen: options.canAdd && link.add !== null,
    addCategoryId: activeCategory(link.add, categories),
    addSpentOn: link.add === null ? null : datableDay(link.spentOn, options.today),
    view: view === 'unsorted' && !options.canSortPayouts ? 'all' : view,
    categoryFilter: isFilterable ? (link.categoryId as string) : ANY,
  }
}

/** The same URL without the one-shot `add` and its `on` (month, view and category stay). */
export function urlWithoutAdd(pathname: string, search: string): string {
  const params = new URLSearchParams(search)
  params.delete('add')
  params.delete('on')
  const rest = params.toString()
  return rest ? `${pathname}?${rest}` : pathname
}
