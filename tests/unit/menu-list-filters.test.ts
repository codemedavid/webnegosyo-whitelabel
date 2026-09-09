/**
 * The menu management filters: one predicate the toolbar, the counts and
 * the grid all agree on.
 */

import { filterMenuItems, countMenuItemsByStatus, MENU_STATUS_FILTERS } from '@/lib/menu-list-filters'
import type { MenuItem } from '@/types/database'

const item = (overrides: Partial<MenuItem>): MenuItem => ({
  id: 'x', tenant_id: 't', category_id: 'c1', name: 'Lechon', description: 'Crispy pork', price: 1,
  image_url: '', is_available: true, is_featured: false, order: 0, ...overrides,
} as MenuItem)

const ITEMS = [
  item({ id: 'a', name: 'Lechon Kawali', description: 'Crispy pork belly' }),
  item({ id: 'b', name: 'Sinigang', description: 'Sour soup', is_available: false }),
  item({ id: 'c', name: 'Bibingka', description: 'Rice cake', category_id: 'c2', presell_enabled: true }),
  item({ id: 'd', name: 'Halo-halo', description: 'Shaved ice', category_id: 'c2', is_available: false, auto_disabled_at: '2026-01-01' }),
]

describe('filterMenuItems', () => {
  it('matches the query against name and description, case-insensitively', () => {
    expect(filterMenuItems(ITEMS, { query: 'PORK', categoryId: 'all', status: 'all' }).map((i) => i.id)).toEqual(['a'])
  })

  it('narrows to a category', () => {
    expect(filterMenuItems(ITEMS, { query: '', categoryId: 'c2', status: 'all' }).map((i) => i.id)).toEqual(['c', 'd'])
  })

  it('filters by availability, out of stock (either cause), and pre-order', () => {
    const ids = (status: (typeof MENU_STATUS_FILTERS)[number]['value']) =>
      filterMenuItems(ITEMS, { query: '', categoryId: 'all', status }).map((i) => i.id)
    expect(ids('available')).toEqual(['a', 'c'])
    expect(ids('out-of-stock')).toEqual(['b', 'd'])
    expect(ids('presell')).toEqual(['c'])
  })

  it('combines every axis', () => {
    expect(filterMenuItems(ITEMS, { query: 'a', categoryId: 'c2', status: 'out-of-stock' }).map((i) => i.id)).toEqual(['d'])
  })
})

describe('countMenuItemsByStatus', () => {
  it('counts each status over the unfiltered list', () => {
    expect(countMenuItemsByStatus(ITEMS)).toEqual({ all: 4, available: 2, 'out-of-stock': 2, presell: 1 })
  })
})
