import { describe, it, expect } from '@jest/globals'
import {
  priceLineModifiers,
  type LinkedModifierItem,
  type ModifierCatalogSource,
} from '@/lib/order-line-modifier-pricing'
import { priceOrderLines, type PriceableOrderLine, type PriceOrderLinesContext } from '@/lib/checkout/price-order-lines'
import { buildOutletMenuIndex } from '@/lib/outlets/outlet-menu-overrides'

/**
 * A line may name its options only as TEXT (`variation`, `addons`). Pricing has
 * always charged those by name, but inventory reads ids only — so "Large" and
 * "Pearls ×2" sent as text were billed and never spent from the shelf, and an
 * option the merchant switched off was accepted as long as nobody sent its id.
 *
 * Pricing therefore reports which catalog ids the text matched (so the stored
 * lines carry them) and which picks are not available right now.
 */

const NO_LINKS = new Map<string, LinkedModifierItem>()

const milkTea: ModifierCatalogSource = {
  modifier_groups: [
    {
      id: 'g-size', name: 'Size', display_order: 0, min_select: 1, max_select: 1,
      options: [
        { id: 'o-med', name: 'Medium', price_modifier: 0, display_order: 0 },
        { id: 'o-large', name: 'Large', price_modifier: 20, display_order: 1 },
        { id: 'o-xl', name: 'XL', price_modifier: 30, display_order: 2, is_available: false },
      ],
    },
    {
      id: 'g-top', name: 'Toppings', selection_mode: 'quantity', display_order: 1, min_select: 0, max_select: null,
      options: [
        { id: 'a-pearls', name: 'Pearls', price_modifier: 15, display_order: 0, stock_mode: 'simple', stock_qty: 5 },
        { id: 'a-pudding', name: 'Pudding', price_modifier: 20, display_order: 1 },
        { id: 'a-cookie', name: '', price_modifier: 0, display_order: 2, menu_item_id: 'cookie' },
      ],
    },
  ],
  // The legacy mirror the unified editor keeps: same ids, no availability flag.
  variation_types: [
    {
      id: 'g-size', name: 'Size', is_required: true, display_order: 0,
      options: [
        { id: 'o-med', name: 'Medium', price_modifier: 0, display_order: 0 },
        { id: 'o-large', name: 'Large', price_modifier: 20, display_order: 1 },
        { id: 'o-xl', name: 'XL', price_modifier: 30, display_order: 2 },
      ],
    },
  ],
}

const cookie: LinkedModifierItem = { id: 'cookie', name: 'Cookie', price: 40, discounted_price: null, is_available: true }

describe('priceLineModifiers — ids the text names', () => {
  it('reports the option and add-on ids matched only by text, with portions', () => {
    const result = priceLineModifiers(
      { variation: 'Large', addons: ['Pearls ×2', 'Pudding'] },
      milkTea,
      NO_LINKS,
    )

    expect(result.delta).toBe(20 + 30 + 20)
    expect(result.textOptionIds).toEqual(['o-large'])
    expect(result.textAddonIds).toEqual(['a-pearls', 'a-pudding'])
    expect(result.textAddonQuantities).toEqual({ 'a-pearls': 2 })
  })

  it('reports nothing for text the claimed ids already account for', () => {
    const result = priceLineModifiers(
      { option_ids: ['o-large'], addon_ids: ['a-pearls'], addon_quantities: { 'a-pearls': 2 }, variation: 'Large', addons: ['Pearls ×2'] },
      milkTea,
      NO_LINKS,
    )

    expect(result.textOptionIds).toEqual([])
    expect(result.textAddonIds).toEqual([])
    expect(result.textAddonQuantities).toEqual({})
  })

  it('names no id for text that matches nothing on the dish', () => {
    const result = priceLineModifiers({ variation: 'Gigantic' }, milkTea, NO_LINKS)

    expect(result.textOptionIds).toEqual([])
    expect(result.unpricedLabels).toEqual(['Gigantic'])
  })
})

describe('priceLineModifiers — picks that are switched off', () => {
  it('flags an option the merchant switched off, claimed by id', () => {
    const result = priceLineModifiers({ option_ids: ['o-xl'], variation: 'XL' }, milkTea, NO_LINKS)

    // The legacy mirror carries the same id without a flag; it must not rescue it.
    expect(result.unavailableNames).toEqual(['XL'])
  })

  it('flags an option the merchant switched off, named only by text', () => {
    const result = priceLineModifiers({ variation: 'XL' }, milkTea, NO_LINKS)

    expect(result.unavailableNames).toEqual(['XL'])
  })

  it('flags a linked option whose dish is unavailable', () => {
    const links = new Map([['cookie', { ...cookie, is_available: false }]])

    const result = priceLineModifiers({ addon_ids: ['a-cookie'], addons: ['Cookie'] }, milkTea, links)

    expect(result.unavailableNames).toEqual(['Cookie'])
  })

  it('flags nothing for available picks', () => {
    const links = new Map([['cookie', cookie]])

    const result = priceLineModifiers(
      { option_ids: ['o-large'], addon_ids: ['a-cookie'], variation: 'Large', addons: ['Cookie'] },
      milkTea,
      links,
    )

    expect(result.unavailableNames).toEqual([])
  })
})

describe('priceOrderLines — stored lines carry what they were charged for', () => {
  const context: PriceOrderLinesContext = {
    storeItems: new Map([['tea', { id: 'tea', name: 'Milk Tea', price: 100, is_available: true, ...milkTea }]]),
    branchOverrides: buildOutletMenuIndex([]),
    outletId: null,
    linkedItems: NO_LINKS,
  }

  const textLine: PriceableOrderLine = {
    menu_item_id: 'tea', menu_item_name: 'Milk Tea', price: 0, quantity: 2, subtotal: 0,
    variation: 'Large', addons: ['Pearls ×2'],
  }

  it('adds the text-matched ids to the line without changing its price', () => {
    const result = priceOrderLines([textLine], context)
    if (!result.ok) throw new Error(result.error)
    const [line] = result.lines

    expect(line.price).toBe(100 + 20 + 30)
    expect(line.option_ids).toEqual(['o-large'])
    expect(line.addon_ids).toEqual(['a-pearls'])
    expect(line.addon_quantities).toEqual({ 'a-pearls': 2 })
  })

  it('prices the line it returns exactly as before (re-pricing is stable)', () => {
    const first = priceOrderLines([textLine], context)
    if (!first.ok) throw new Error(first.error)
    const second = priceOrderLines(first.lines, context)
    if (!second.ok) throw new Error(second.error)

    expect(second.lines[0].price).toBe(first.lines[0].price)
    expect(second.lines[0].option_ids).toEqual(['o-large'])
    expect(second.lines[0].addon_quantities).toEqual({ 'a-pearls': 2 })
  })

  it('leaves a line that names its picks by id untouched', () => {
    const result = priceOrderLines([{ ...textLine, option_ids: ['o-large'], addon_ids: ['a-pearls'], addon_quantities: { 'a-pearls': 2 } }], context)
    if (!result.ok) throw new Error(result.error)

    expect(result.lines[0].option_ids).toEqual(['o-large'])
    expect(result.lines[0].addon_ids).toEqual(['a-pearls'])
  })

  it('refuses a line with a switched-off option, in words a diner can act on', () => {
    const result = priceOrderLines([{ ...textLine, variation: 'XL', addons: [] }], context)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/XL/)
    expect(result.error).toMatch(/Milk Tea/)
    expect(result.error).toMatch(/not available/i)
  })
})
