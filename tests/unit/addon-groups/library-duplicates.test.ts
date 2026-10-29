import { describe, it, expect } from '@jest/globals'
import { duplicateCopyIds, isSameLibraryGroup, uniqueLibraryGroups } from '@/lib/addon-groups/library-duplicates'
import type { ModifierGroupLibraryEntry } from '@/types/database'

/**
 * One store saved the same "Add-ons" group 27 times in a few minutes, half of
 * them at ₱0, and the picker listed all 27 under one name. Identical copies are
 * shown once and can be cleared; a copy with different prices is NOT a duplicate.
 */

const group = (id: string, created: string, price = 15, name = 'Add-ons'): ModifierGroupLibraryEntry => ({
  id,
  tenant_id: 't1',
  name,
  selection_mode: 'quantity',
  min_select: 0,
  max_select: null,
  options: [
    { id: `${id}-a`, name: 'Fried Rice', price_modifier: price, display_order: 0 },
    { id: `${id}-b`, name: 'Egg', price_modifier: 20, display_order: 1 },
  ],
  is_active: true,
  display_order: 0,
  created_at: created,
  updated_at: created,
})

describe('library duplicates', () => {
  const entries = [
    group('b', '2026-10-28T18:00:00Z'),
    group('a', '2026-10-28T17:00:00Z'),
    group('zero', '2026-10-28T16:00:00Z', 0),
    group('c', '2026-10-28T19:00:00Z', 15, ' add-ons'),
    group('drinks', '2026-10-28T19:00:00Z', 15, 'Drinks'),
  ]

  it('keeps the oldest of each identical set and lists the rest as copies', () => {
    expect(duplicateCopyIds(entries).sort()).toEqual(['b', 'c'])
  })

  it('shows each distinct group once, with how many copies it has', () => {
    expect(uniqueLibraryGroups(entries).map(({ entry, copies }) => [entry.id, copies])).toEqual([
      ['zero', 1],
      ['a', 3],
      ['drinks', 1],
    ])
  })

  it('treats a different rule or option order as a different group', () => {
    const required = { ...group('r', '2026-10-28T20:00:00Z'), min_select: 1 }
    expect(duplicateCopyIds([group('a', '2026-10-28T17:00:00Z'), required])).toEqual([])
  })

  it('compares a draft with a stored group', () => {
    const stored = group('a', '2026-10-28T17:00:00Z')
    const draft = { name: 'add-ons', selection_mode: 'quantity' as const, min_select: 0, max_select: null, options: stored.options.map(({ name, price_modifier, display_order }) => ({ name, price_modifier, display_order })) }
    expect(isSameLibraryGroup(stored, draft)).toBe(true)
    expect(isSameLibraryGroup(stored, { ...draft, max_select: 3 })).toBe(false)
  })

  it('keeps an active copy over an older hidden one, and tells linked options apart', () => {
    const hidden = { ...group('old', '2026-10-01T00:00:00Z'), is_active: false }
    expect(duplicateCopyIds([hidden, group('new', '2026-10-28T00:00:00Z')])).toEqual(['old'])

    const linked = group('l', '2026-10-28T00:00:00Z')
    const withLink = { ...linked, id: 'l2', options: linked.options.map((o, i) => (i === 0 ? { ...o, menu_item_id: 'dish-1' } : o)) }
    expect(duplicateCopyIds([linked, withLink])).toEqual([])
  })
})
