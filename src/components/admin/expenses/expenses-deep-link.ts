/**
 * The links other screens send into the expense book (Profit's trust strip):
 *
 * - `?add=1` opens Add expense; `?add=<categoryId>` opens it on that category.
 * - `?view=unsorted` (or any saved view) opens that view.
 * - `?category=<id>` applies the category filter.
 * - `?month=YYYY-MM` picks the month (read by the page).
 *
 * Pure. Anything unknown is ignored, never an error: a stale link still opens
 * the book. `add` is one-shot and is removed from the URL once used, so a
 * refresh doesn't reopen the dialog.
 */

import type { ExpenseCategory } from '@/lib/expenses/types'
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
  }
}

export interface ResolvedLink {
  isAddOpen: boolean
  /** Preselected in the Add dialog; null = none. */
  addCategoryId: string | null
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
  options: { canAdd: boolean; canSortPayouts: boolean },
): ResolvedLink {
  const view = (EXPENSE_VIEWS as readonly string[]).includes(link.view ?? '') ? (link.view as ExpenseView) : 'all'
  const isFilterable = link.categoryId !== null && categories.some((category) => category.id === link.categoryId)
  return {
    isAddOpen: options.canAdd && link.add !== null,
    addCategoryId: activeCategory(link.add, categories),
    view: view === 'unsorted' && !options.canSortPayouts ? 'all' : view,
    categoryFilter: isFilterable ? (link.categoryId as string) : ANY,
  }
}

/** The same URL without the one-shot `add` (month, view and category stay). */
export function urlWithoutAdd(pathname: string, search: string): string {
  const params = new URLSearchParams(search)
  params.delete('add')
  const rest = params.toString()
  return rest ? `${pathname}?${rest}` : pathname
}
