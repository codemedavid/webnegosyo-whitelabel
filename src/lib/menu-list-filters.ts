/**
 * Menu management's filters — one predicate the toolbar chips, their counts
 * and the grid all share, so a chip's number always matches what the grid
 * shows when it is tapped.
 */

import type { MenuItem } from '@/types/database'

/** The fields the filters read — a lean list row satisfies it as well as a full dish. */
export type MenuListFilterable = Pick<MenuItem, 'name' | 'description' | 'category_id' | 'is_available' | 'presell_enabled'>

export type MenuStatusFilter = 'all' | 'available' | 'out-of-stock' | 'presell'

export const MENU_STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'out-of-stock', label: 'Out of stock' },
  { value: 'presell', label: 'Pre-order' },
] as const satisfies readonly { value: MenuStatusFilter; label: string }[]

/**
 * The status tabs worth showing. "Pre-order" only appears when a dish is on
 * pre-order (or the tab is the one open): almost no store uses pre-sell, and
 * an always-zero tab was one more thing to read on every menu (2026-11-16).
 */
export function visibleStatusFilters(
  counts: Record<MenuStatusFilter, number>,
  active: MenuStatusFilter,
): ReadonlyArray<(typeof MENU_STATUS_FILTERS)[number]> {
  return MENU_STATUS_FILTERS.filter(({ value }) => value !== 'presell' || counts.presell > 0 || active === 'presell')
}

export interface MenuListFilters {
  query: string
  /** A category id, or 'all'. */
  categoryId: string
  status: MenuStatusFilter
}

export const EMPTY_MENU_FILTERS: MenuListFilters = { query: '', categoryId: 'all', status: 'all' }

function matchesStatus(item: MenuListFilterable, status: MenuStatusFilter): boolean {
  switch (status) {
    case 'available':
      return item.is_available
    case 'out-of-stock':
      return !item.is_available
    case 'presell':
      return item.presell_enabled === true
    default:
      return true
  }
}

function matchesQuery(item: MenuListFilterable, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return item.name.toLowerCase().includes(needle) || (item.description ?? '').toLowerCase().includes(needle)
}

export function filterMenuItems<T extends MenuListFilterable>(items: readonly T[], filters: MenuListFilters): T[] {
  return items.filter(
    (item) =>
      matchesQuery(item, filters.query) &&
      (filters.categoryId === 'all' || item.category_id === filters.categoryId) &&
      matchesStatus(item, filters.status),
  )
}

export function countMenuItemsByStatus(items: readonly MenuListFilterable[]): Record<MenuStatusFilter, number> {
  return {
    all: items.length,
    available: items.filter((i) => matchesStatus(i, 'available')).length,
    'out-of-stock': items.filter((i) => matchesStatus(i, 'out-of-stock')).length,
    presell: items.filter((i) => matchesStatus(i, 'presell')).length,
  }
}

export function hasActiveMenuFilters(filters: MenuListFilters): boolean {
  return filters.query.trim() !== '' || filters.categoryId !== 'all' || filters.status !== 'all'
}
