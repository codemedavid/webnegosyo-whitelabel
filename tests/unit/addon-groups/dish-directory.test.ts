import { describe, it, expect } from '@jest/globals'
import { buildDishDirectory, countSameNameGroups } from '@/lib/addon-groups/dish-directory'

/**
 * The dish list behind "Insert into dishes": every dish with its category and
 * the names of the groups it already has (legacy columns included), so the
 * dialog can say "5 of these already have an Add-ons group" before writing.
 */

describe('buildDishDirectory', () => {
  const categories = [
    { id: 'c2', name: 'Drinks', order: 2 },
    { id: 'c1', name: 'Silog', order: 1 },
  ]
  const dishes = [
    { id: 'd2', name: 'Iced Tea', category_id: 'c2', modifier_groups: [] },
    { id: 'd1', name: 'Tapsilog', category_id: 'c1', addons: [{ id: 'a', name: 'Fried Rice', price: 0 }] },
    {
      id: 'd3', name: 'Porksilog', category_id: 'c1',
      modifier_groups: [{ id: 'g', name: 'Size', display_order: 0, min_select: 1, max_select: 1, options: [{ id: 'o', name: 'Solo', price_modifier: 0, display_order: 0 }] }],
    },
    { id: 'd4', name: 'Mystery', category_id: null },
  ]

  it('orders dishes by category and keeps their group names', () => {
    expect(buildDishDirectory(dishes, categories)).toEqual([
      { id: 'd1', name: 'Tapsilog', categoryName: 'Silog', groupNames: ['Add-ons'] },
      { id: 'd3', name: 'Porksilog', categoryName: 'Silog', groupNames: ['Size'] },
      { id: 'd2', name: 'Iced Tea', categoryName: 'Drinks', groupNames: [] },
      { id: 'd4', name: 'Mystery', categoryName: 'Other', groupNames: [] },
    ])
  })

  it('counts chosen dishes that already have a group of that name', () => {
    const directory = buildDishDirectory(dishes, categories)
    expect(countSameNameGroups(directory, new Set(['d1', 'd2', 'd3']), ' add-ons')).toBe(1)
  })
})
