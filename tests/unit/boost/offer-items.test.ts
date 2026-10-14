import { needsChoices, offerableItems, oneTapSelection, postAddOffers } from '@/lib/boost/offer-items'
import type { MenuItem } from '@/types/database'

const base = (overrides: Partial<MenuItem> = {}): MenuItem =>
  ({ id: 'x', name: 'Coke', price: 30, is_available: true, variations: [], variation_types: [], addons: [], ...overrides }) as MenuItem

describe('needsChoices', () => {
  it('adds a plain item in one tap', () => {
    expect(needsChoices(base())).toBe(false)
  })

  it('opens pre-order items so the customer can choose a pickup date', () => {
    expect(needsChoices(base({ presell_enabled: true }))).toBe(true)
  })

  it('optional add-ons do not block a one-tap add', () => {
    expect(needsChoices(base({ addons: [{ id: 'a', name: 'Ice', price: 0 }] as MenuItem['addons'] }))).toBe(false)
  })

  it('a required size or flavour has to be chosen first', () => {
    expect(needsChoices(base({
      variation_types: [{ id: 't', name: 'Size', is_required: true, display_order: 0, options: [{ id: 'o', name: 'L', price_modifier: 10 }] }],
    } as Partial<MenuItem>))).toBe(true)
    expect(needsChoices(base({ variations: [{ id: 'v', name: 'Large', price_modifier: 10 }] } as Partial<MenuItem>))).toBe(true)
  })

  it('a modifier group with a minimum has to be chosen first', () => {
    expect(needsChoices(base({
      modifier_groups: [{ id: 'g', name: 'Flavor', display_order: 0, min_select: 1, max_select: 1, options: [] }],
    } as Partial<MenuItem>))).toBe(true)
    expect(needsChoices(base({
      modifier_groups: [{ id: 'g', name: 'Extras', display_order: 0, min_select: 0, max_select: null, options: [] }],
    } as Partial<MenuItem>))).toBe(false)
  })
})

describe('oneTapSelection', () => {
  it('adds a plain dish with no picks at all', () => {
    expect(oneTapSelection(base())).toEqual({ variations: undefined, addons: [] })
  })

  it('carries the default picks of optional modifier groups, as the product page seeds them', () => {
    const item = base({
      modifier_groups: [
        { id: 'sugar', name: 'Sugar', display_order: 0, min_select: 0, max_select: 1, options: [
          { id: 'full', name: '100%', price_modifier: 0, display_order: 0, is_default: true },
          { id: 'half', name: '50%', price_modifier: 0, display_order: 1 },
        ] },
        { id: 'extras', name: 'Extras', display_order: 1, min_select: 0, max_select: null, options: [
          { id: 'pearls', name: 'Pearls', price_modifier: 15, display_order: 0, is_default: true },
          { id: 'jelly', name: 'Jelly', price_modifier: 15, display_order: 1 },
        ] },
      ],
    } as Partial<MenuItem>)

    const { variations, addons } = oneTapSelection(item)

    expect(Object.values(variations ?? {}).map((option) => option.id)).toEqual(['full'])
    expect(addons.map((addon) => addon.id)).toEqual(['pearls'])
  })

  it('seeds one pick per optional legacy variation type, like the legacy product page', () => {
    const item = base({
      variation_types: [{ id: 'temp', name: 'Temp', is_required: false, display_order: 0, options: [
        { id: 'hot', name: 'Hot', price_modifier: 0, display_order: 0 },
        { id: 'iced', name: 'Iced', price_modifier: 10, display_order: 1, is_default: true },
      ] }],
    } as Partial<MenuItem>)

    expect(oneTapSelection(item).variations).toEqual({ temp: expect.objectContaining({ id: 'iced' }) })
  })
})

describe('needsChoices with default picks', () => {
  it('opens the dish when a default pick is a linked dish (its price is only known on the page)', () => {
    expect(needsChoices(base({
      modifier_groups: [{ id: 'side', name: 'Side', display_order: 0, min_select: 0, max_select: 1, options: [
        { id: 'coke', name: 'Coke', price_modifier: 0, display_order: 0, is_default: true, menu_item_id: 'm-coke' },
      ] }],
    } as Partial<MenuItem>))).toBe(true)
  })
})

describe('offerableItems', () => {
  it('drops unavailable items, excluded items and repeats, and caps the count', () => {
    const items = [
      base({ id: 'a' }),
      base({ id: 'b', is_available: false }),
      base({ id: 'c' }),
      base({ id: 'a' }),
      base({ id: 'd' }),
    ]
    expect(offerableItems(items, { excludeIds: new Set(['c']), limit: 5 }).map((i) => i.id)).toEqual(['a', 'd'])
    expect(offerableItems(items, { limit: 1 }).map((i) => i.id)).toEqual(['a'])
  })
})

describe('postAddOffers', () => {
  const pairings = [base({ id: 'lumpia' }), base({ id: 'rice' }), base({ id: 'gulay' })]

  it('leaves out the dish just added and anything already in the cart', () => {
    const offers = postAddOffers(pairings, { addedItemId: 'rice', cartItemIds: ['lumpia'] })
    expect(offers.map((i) => i.id)).toEqual(['gulay'])
  })

  it('offers nothing once every pairing is already in the order, so no empty sheet opens', () => {
    expect(postAddOffers(pairings, { addedItemId: 'bbq', cartItemIds: ['lumpia', 'rice', 'gulay'] })).toEqual([])
  })

  it('shows at most four pairings', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => base({ id }))
    expect(postAddOffers(many, { addedItemId: 'x', cartItemIds: [] })).toHaveLength(4)
  })
})
