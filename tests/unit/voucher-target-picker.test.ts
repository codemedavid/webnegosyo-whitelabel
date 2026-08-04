/**
 * Picking what a scoped voucher applies to.
 *
 * A voucher scoped to products or categories with an empty target list is a
 * dead code — the engine reads no targets as "matches nothing". So the picker
 * is the only thing standing between a merchant and a code that silently never
 * fires. These tests pin the parts that decide what a merchant sees and what
 * ends up in `targetIds`: the option list, the search, the toggling, and the
 * honest reporting of targets that no longer exist on the menu.
 */

import {
  toProductOptions,
  toCategoryOptions,
  filterTargetOptions,
  toggleTargetId,
  summarizeTargetSelection,
} from '@/lib/vouchers/target-picker'

const CATEGORIES = [
  { id: 'cat-drinks', name: 'Drinks' },
  { id: 'cat-food', name: 'Rice Meals' },
]

const ITEMS = [
  { id: 'item-latte', name: 'Iced Latte', category_id: 'cat-drinks' },
  { id: 'item-adobo', name: 'Chicken Adobo', category_id: 'cat-food' },
  { id: 'item-orphan', name: 'Mystery Item', category_id: 'cat-gone' },
]

describe('toProductOptions', () => {
  it('labels each product with its own name', () => {
    const options = toProductOptions(ITEMS, CATEGORIES)

    expect(options.map((o) => o.label)).toEqual(
      expect.arrayContaining(['Iced Latte', 'Chicken Adobo'])
    )
  })

  it('carries the id the engine matches on', () => {
    const options = toProductOptions(ITEMS, CATEGORIES)

    expect(options.find((o) => o.label === 'Iced Latte')?.id).toBe('item-latte')
  })

  it('groups a product under its category so two similarly named items can be told apart', () => {
    const options = toProductOptions(ITEMS, CATEGORIES)

    expect(options.find((o) => o.id === 'item-adobo')?.group).toBe('Rice Meals')
  })

  it('still offers a product whose category was deleted rather than dropping it', () => {
    const options = toProductOptions(ITEMS, CATEGORIES)

    const orphan = options.find((o) => o.id === 'item-orphan')
    expect(orphan).toBeDefined()
    expect(orphan?.group).toBeUndefined()
  })
})

describe('toCategoryOptions', () => {
  it('offers every category by name', () => {
    const options = toCategoryOptions(CATEGORIES)

    expect(options).toEqual([
      { id: 'cat-drinks', label: 'Drinks' },
      { id: 'cat-food', label: 'Rice Meals' },
    ])
  })
})

describe('filterTargetOptions', () => {
  const options = toProductOptions(ITEMS, CATEGORIES)

  it('returns everything when the search box is empty', () => {
    expect(filterTargetOptions(options, '   ')).toHaveLength(options.length)
  })

  it('matches on the product name regardless of case', () => {
    expect(filterTargetOptions(options, 'LATTE').map((o) => o.id)).toEqual(['item-latte'])
  })

  it('matches on the category name so a merchant can narrow to a section', () => {
    expect(filterTargetOptions(options, 'rice').map((o) => o.id)).toEqual(['item-adobo'])
  })

  it('returns nothing when no option matches', () => {
    expect(filterTargetOptions(options, 'zzz')).toEqual([])
  })
})

describe('toggleTargetId', () => {
  it('adds an id that was not selected', () => {
    expect(toggleTargetId(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('removes an id that was already selected', () => {
    expect(toggleTargetId(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('leaves the original list untouched', () => {
    const selected = ['a']
    toggleTargetId(selected, 'b')
    expect(selected).toEqual(['a'])
  })

  it('never stores the same id twice', () => {
    expect(toggleTargetId(['a', 'a'], 'b')).toEqual(['a', 'b'])
  })
})

describe('summarizeTargetSelection', () => {
  const options = toCategoryOptions(CATEGORIES)

  it('asks for a choice when nothing is picked', () => {
    const summary = summarizeTargetSelection([], options)

    expect(summary.selectedCount).toBe(0)
    expect(summary.missingIds).toEqual([])
  })

  it('counts what is picked', () => {
    expect(summarizeTargetSelection(['cat-drinks'], options).selectedCount).toBe(1)
  })

  it('flags a saved target that no longer exists on the menu', () => {
    const summary = summarizeTargetSelection(['cat-drinks', 'cat-deleted'], options)

    expect(summary.missingIds).toEqual(['cat-deleted'])
    // The deleted one still counts as selected — it is still in `targetIds`.
    expect(summary.selectedCount).toBe(2)
  })
})
