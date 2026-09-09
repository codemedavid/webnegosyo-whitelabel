import { priceLoyaltyCart, type LoyaltyPricingCatalogItem } from '@/lib/loyalty/quote-pricing'
import type { LoyaltyEntitlementTerms } from '@/lib/loyalty/types'

const item: LoyaltyPricingCatalogItem = { id: 'latte', name: 'Latte', price: 150, is_available: true,
  addons: [{ id: 'shot', name: 'Extra shot', price: 20 }],
}
const terms: LoyaltyEntitlementTerms = { programId: 'program', programName: 'Coffee card', versionNumber: 1,
  isExclusive: true, reward: { type: 'free_item', menuItemId: 'latte', itemName: 'Latte' },
}
const cart = { lines: [{ menuItemId: 'latte', quantity: 2, selectedOptionIds: ['shot'] }] }

it('prices server names and extras and waives just one base unit', () => {
  expect(priceLoyaltyCart(cart, [item], terms)).toEqual({ ok: true,
    lines: [{ menuItemId: 'latte', name: 'Latte', quantity: 2, baseUnitPriceCentavos: 15000,
      unitPriceCentavos: 17000, subtotalCentavos: 34000,
      selectedOptions: [{ groupId: 'legacy-addons', groupName: 'Add-ons', optionId: 'shot', name: 'Extra shot', priceModifierCentavos: 2000 }],
    }],
    discount: { label: 'Free Latte', loyaltyProgramId: 'program', amountCentavos: 15000 },
    totals: { subtotalCentavos: 34000, discountCentavos: 15000, grandTotalCentavos: 19000 },
  })
})

it.each([null, [], {}, { lines: [] }, { ...cart, total: 1 }, { ...cart, discounts: [] },
  { lines: [{ ...cart.lines[0], price: 1 }] }, { lines: [{ ...cart.lines[0], name: 'Fake' }] },
  ...[0, -1, 1.2, 1000, NaN, Infinity, '2'].map(quantity => ({ lines: [{ ...cart.lines[0], quantity }] })),
  { lines: Array(101).fill(cart.lines[0]) }, { lines: [{ ...cart.lines[0], selectedOptionIds: ['shot', 'shot'] }] },
])('rejects malformed or client-priced cart %p', input => {
  expect(priceLoyaltyCart(input, [item], terms)).toEqual({ ok: false, reason: 'invalid_cart' })
})

it('rejects unknown items and unknown, unavailable or invalid modifier selections', () => {
  const grouped: LoyaltyPricingCatalogItem = { ...item, modifier_groups: [{ id: 'size', name: 'Size', min_select: 1, max_select: 1, display_order: 0,
    options: [{ id: 'large', name: 'Large', price_modifier: 10, display_order: 0 }, { id: 'small', name: 'Small', price_modifier: 0, display_order: 1 }] }] }
  expect(priceLoyaltyCart(cart, [], terms)).toEqual({ ok: false, reason: 'unknown_item' })
  for (const selectedOptionIds of [[], ['unknown'], ['large', 'small']]) {
    expect(priceLoyaltyCart({ lines: [{ ...cart.lines[0], selectedOptionIds }] }, [grouped], terms).ok).toBe(false)
  }
  grouped.modifier_groups![0].options[0].is_available = false
  expect(priceLoyaltyCart({ lines: [{ ...cart.lines[0], selectedOptionIds: ['large'] }] }, [grouped], terms)).toEqual({ ok: false, reason: 'option_unavailable' })
  expect(priceLoyaltyCart(cart, [{ ...item, is_available: false }], terms)).toEqual({ ok: false, reason: 'item_unavailable' })
  expect(priceLoyaltyCart(cart, [{ ...item, presell_enabled: true }], terms)).toEqual({ ok: false, reason: 'unsupported_item' })
  expect(priceLoyaltyCart(cart, [{ ...item, is_bundle: true }], terms)).toEqual({ ok: false, reason: 'unsupported_item' })
  grouped.modifier_groups![0].options[0].menu_item_id = 'linked'
  expect(priceLoyaltyCart({ lines: [{ ...cart.lines[0], selectedOptionIds: ['small'] }] }, [grouped], terms)).toEqual({ ok: false, reason: 'unsupported_item' })
})

it('uses effective sale prices and exact fractional centavos with a percent cap', () => {
  const priced = priceLoyaltyCart(cart, [{ ...item, discounted_price: 100.01, addons: [{ id: 'shot', name: 'Shot', price: 0.29 }] }],
    { ...terms, reward: { type: 'percent', percent: 50, maxAmount: 10.01 } })
  expect(priced.ok && priced.totals).toEqual({ subtotalCentavos: 20060, discountCentavos: 1001, grandTotalCentavos: 19059 })
  const free = priceLoyaltyCart(cart, [{ ...item, discounted_price: 100.01 }], terms)
  expect(free.ok && free.discount.amountCentavos).toBe(10001)
})

it('fails closed for corrupt, sub-centavo and unbounded money', () => {
  for (const price of [NaN, Infinity, -1, 1.001, Number.MAX_SAFE_INTEGER, 10_000_000]) {
    expect(priceLoyaltyCart(cart, [{ ...item, price }], terms).ok).toBe(false)
  }
  expect(priceLoyaltyCart(cart, [{ ...item, addons: [{ id: 'shot', name: 'Shot', price: -1 }] }], terms).ok).toBe(false)
  for (const reward of [{ type: 'fixed' as const, amount: NaN }, { type: 'fixed' as const, amount: 1.001 },
    { type: 'percent' as const, percent: 101 }, { type: 'percent' as const, percent: -1 }, { type: 'percent' as const, percent: 10, maxAmount: Infinity }]) {
    expect(priceLoyaltyCart(cart, [item], { ...terms, reward }).ok).toBe(false)
  }
  expect(priceLoyaltyCart({ lines: Array(100).fill({ ...cart.lines[0], quantity: 999 }) }, [{ ...item, price: 999999 }], terms).ok).toBe(false)
})

it('rejects invalid group rules and ambiguous catalog option identifiers', () => {
  const grouped: LoyaltyPricingCatalogItem = { ...item, modifier_groups: [{ id: 'extras', name: 'Extras', min_select: NaN, max_select: 1, display_order: 0,
    options: [{ id: 'shot', name: 'Shot', price_modifier: 20, display_order: 0 }] }] }
  expect(priceLoyaltyCart(cart, [grouped], terms)).toEqual({ ok: false, reason: 'invalid_catalog' })
  grouped.modifier_groups![0].min_select = 0
  grouped.modifier_groups!.push({ ...grouped.modifier_groups![0], id: 'other' })
  expect(priceLoyaltyCart(cart, [grouped], terms)).toEqual({ ok: false, reason: 'invalid_catalog' })
})

it('waives only one unit across repeated item lines without mutating frozen terms', () => {
  const frozenTerms = Object.freeze({ ...terms, reward: Object.freeze({ ...terms.reward }) })
  const result = priceLoyaltyCart({ lines: [cart.lines[0], cart.lines[0]] }, [item], frozenTerms)
  expect(result.ok && result.totals).toEqual({ subtotalCentavos: 68000, discountCentavos: 15000, grandTotalCentavos: 53000 })
})

it('checks simple option stock across quantities and repeated cart lines', () => {
  const stocked: LoyaltyPricingCatalogItem = { ...item, modifier_groups: [{ id: 'extras', name: 'Extras', min_select: 0, max_select: null, display_order: 0,
    options: [{ id: 'shot', name: 'Shot', price_modifier: 20, display_order: 0, stock_mode: 'simple', stock_qty: 1 }] }] }
  expect(priceLoyaltyCart(cart, [stocked], terms)).toEqual({ ok: false, reason: 'option_unavailable' })
  const single = { ...cart.lines[0], quantity: 1 }
  expect(priceLoyaltyCart({ lines: [single, single] }, [stocked], terms)).toEqual({ ok: false, reason: 'option_unavailable' })
  expect(priceLoyaltyCart({ lines: [single] }, [stocked], terms).ok).toBe(true)
})

it('fails closed for selected recipe-stock options until an inventory resolver exists', () => {
  const recipe: LoyaltyPricingCatalogItem = { ...item, modifier_groups: [{ id: 'extras', name: 'Extras', min_select: 0, max_select: null, display_order: 0,
    options: [{ id: 'shot', name: 'Shot', price_modifier: 20, display_order: 0, stock_mode: 'recipe', is_available: true }] }] }
  expect(priceLoyaltyCart(cart, [recipe], terms)).toEqual({ ok: false, reason: 'unsupported_item' })
  expect(priceLoyaltyCart({ lines: [{ ...cart.lines[0], selectedOptionIds: [] }] }, [recipe], terms).ok).toBe(true)
})

it('rejects malformed persisted reward terms instead of throwing or issuing an unnamed discount', () => {
  for (const reward of [null, { type: 'unknown', percent: 10 }, { type: 'free_item', menuItemId: item.id }]) {
    expect(priceLoyaltyCart(cart, [item], { ...terms, reward })).toEqual({ ok: false, reason: 'invalid_reward' })
  }
  expect(priceLoyaltyCart(cart, [item], null)).toEqual({ ok: false, reason: 'invalid_reward' })
})
