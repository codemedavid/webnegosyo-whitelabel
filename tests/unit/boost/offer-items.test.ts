import { needsChoices, offerableItems, postAddOffers } from '@/lib/boost/offer-items'
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
