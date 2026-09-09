/**
 * Menu management's filters — one predicate the toolbar chips, their counts
 * and the grid all share, so a chip's number always matches what the grid
 * shows when it is tapped.
 */

import type { MenuItem } from '@/types/database'

export type MenuStatusFilter = 'all' | 'available' | 'out-of-stock' | 'presell'

export const MENU_STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'out-of-stock', label: 'Out of stock' },
  { value: 'presell', label: 'Pre-order' },
] as const satisfies readonly { value: MenuStatusFilter; label: string }[]

export interface MenuListFilters {
  query: string
  /** A category id, or 'all'. */
  categoryId: string
  status: MenuStatusFilter
}

export const EMPTY_MENU_FILTERS: MenuListFilters = { query: '', categoryId: 'all', status: 'all' }

function matchesStatus(item: MenuItem, status: MenuStatusFilter): boolean {
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

function matchesQuery(item: MenuItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return item.name.toLowerCase().includes(needle) || (item.description ?? '').toLowerCase().includes(needle)
}

export function filterMenuItems(items: readonly MenuItem[], filters: MenuListFilters): MenuItem[] {
  return items.filter(
    (item) =>
      matchesQuery(item, filters.query) &&
      (filters.categoryId === 'all' || item.category_id === filters.categoryId) &&
      matchesStatus(item, filters.status),
  )
}

export function countMenuItemsByStatus(items: readonly MenuItem[]): Record<MenuStatusFilter, number> {
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
