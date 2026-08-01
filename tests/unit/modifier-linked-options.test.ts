import {
  collectLinkedItemIds,
  resolveLinkedOptions,
  type LinkedItemSnapshot,
} from '@/lib/modifier-linked-options'
import type { ModifierGroup } from '@/types/database'

/**
 * Add-on options that LINK to a menu item instead of carrying a typed name and
 * price. The link is a live reference: `menu_item_id` is the only thing stored,
 * and the name, price and image are read from the linked item at render time, so
 * repricing a drink updates every add-on that offers it without re-attaching.
 *
 * Resolution is a pure step over already-normalized groups: the storefront
 * collects the linked ids, fetches those items, then resolves. Keeping it pure
 * means the price and availability rules are testable without a database.
 */

function linkedGroup(overrides: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id: 'g-drinks',
    name: 'Add a drink',
    display_order: 0,
    min_select: 0,
    max_select: null,
    options: [
      { id: 'o-coke', name: '', price_modifier: 0, display_order: 0, menu_item_id: 'mi-coke' },
      { id: 'o-typed', name: 'Extra Cheese', price_modifier: 15, display_order: 1 },
    ],
    ...overrides,
  }
}

function item(overrides: Partial<LinkedItemSnapshot> = {}): LinkedItemSnapshot {
  return {
    id: 'mi-coke',
    name: 'Coke',
    price: 50,
    image_url: 'https://cdn.example/coke.jpg',
    is_available: true,
    ...overrides,
  }
}

function catalog(...items: LinkedItemSnapshot[]) {
  return new Map(items.map((i) => [i.id, i]))
}

describe('collectLinkedItemIds', () => {
  it('collects the ids the storefront must fetch', () => {
    expect(collectLinkedItemIds([linkedGroup()])).toEqual(['mi-coke'])
  })

  it('ignores options that carry no link', () => {
    const groups = [linkedGroup({ options: [
      { id: 'o-typed', name: 'Extra Cheese', price_modifier: 15, display_order: 0 },
    ] })]
    expect(collectLinkedItemIds(groups)).toEqual([])
  })

  it('de-duplicates an item offered by more than one group', () => {
    const a = linkedGroup({ id: 'g-a' })
    const b = linkedGroup({ id: 'g-b' })
    expect(collectLinkedItemIds([a, b])).toEqual(['mi-coke'])
  })
})

describe('resolveLinkedOptions', () => {
  it('takes the name, price and image from the linked item', () => {
    const [group] = resolveLinkedOptions([linkedGroup()], catalog(item()))
    const coke = group.options[0]

    expect(coke.name).toBe('Coke')
    expect(coke.price_modifier).toBe(50)
    expect(coke.image_url).toBe('https://cdn.example/coke.jpg')
  })

  it('charges the sale price when the linked item is discounted', () => {
    const [group] = resolveLinkedOptions(
      [linkedGroup()],
      catalog(item({ price: 50, discounted_price: 35 })),
    )

    expect(group.options[0].price_modifier).toBe(35)
  })

  it('ignores a discount that is not actually cheaper', () => {
    const [group] = resolveLinkedOptions(
      [linkedGroup()],
      catalog(item({ price: 50, discounted_price: 60 })),
    )

    expect(group.options[0].price_modifier).toBe(50)
  })

  it('marks the option unavailable when the linked item is unavailable', () => {
    const [group] = resolveLinkedOptions(
      [linkedGroup()],
      catalog(item({ is_available: false })),
    )

    expect(group.options[0].is_available).toBe(false)
  })

  it('marks the option unavailable when the linked item is missing (deleted)', () => {
    const [group] = resolveLinkedOptions([linkedGroup()], catalog())

    expect(group.options[0].is_available).toBe(false)
  })

  it('keeps a readable label for a missing linked item rather than rendering blank', () => {
    const [group] = resolveLinkedOptions([linkedGroup()], catalog())

    expect(group.options[0].name).toBe('Unavailable item')
  })

  it('leaves typed (unlinked) options completely untouched', () => {
    const [group] = resolveLinkedOptions([linkedGroup()], catalog(item()))

    expect(group.options[1]).toEqual({
      id: 'o-typed',
      name: 'Extra Cheese',
      price_modifier: 15,
      display_order: 1,
    })
  })

  it('preserves the option id so cart selections stay stable', () => {
    const [group] = resolveLinkedOptions([linkedGroup()], catalog(item()))

    expect(group.options[0].id).toBe('o-coke')
  })

  it('preserves group identity and selection rules', () => {
    const [group] = resolveLinkedOptions([linkedGroup()], catalog(item()))

    expect(group).toMatchObject({ id: 'g-drinks', name: 'Add a drink', min_select: 0, max_select: null })
  })

  it('does not mutate the input groups', () => {
    const groups = [linkedGroup()]
    resolveLinkedOptions(groups, catalog(item()))

    expect(groups[0].options[0].name).toBe('')
    expect(groups[0].options[0].price_modifier).toBe(0)
  })

  it('is a no-op when nothing is linked', () => {
    const groups = [linkedGroup({ options: [
      { id: 'o-typed', name: 'Extra Cheese', price_modifier: 15, display_order: 0 },
    ] })]

    expect(resolveLinkedOptions(groups, catalog())).toEqual(groups)
  })
})
