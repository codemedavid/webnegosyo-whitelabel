import { describe, it, expect } from '@jest/globals'
import {
  priceLineModifiers,
  type LinkedModifierItem,
  type ModifierCatalogSource,
} from '@/lib/order-line-modifier-pricing'
import {
  priceOrderLines,
  type PriceableOrderLine,
  type PriceOrderLinesContext,
} from '@/lib/checkout/price-order-lines'

/**
 * The per-add-on breakdown stored with an order line (`order_items.addon_details`).
 *
 * An order used to keep add-ons as bare labels ("Fried Rice ×2"), so the admin
 * order page, receipts and Messenger could never say what an add-on cost. The
 * breakdown is priced from the dish's OWN JSON on the server, the same catalog
 * the charge comes from, so what the merchant reads is what the line was billed.
 */

const NO_LINKS = new Map<string, LinkedModifierItem>()

const silog: ModifierCatalogSource = {
  modifier_groups: [
    {
      id: 'g-size',
      name: 'Size',
      display_order: 0,
      min_select: 1,
      max_select: 1,
      options: [
        { id: 'o-solo', name: 'Solo', price_modifier: 0, display_order: 0 },
        { id: 'o-big', name: 'Big', price_modifier: 30, display_order: 1 },
      ],
    },
    {
      id: 'g-addons',
      name: 'Add-ons',
      selection_mode: 'quantity',
      display_order: 1,
      min_select: 0,
      max_select: null,
      options: [
        { id: 'a-rice', name: 'Fried Rice', price_modifier: 15, display_order: 0 },
        { id: 'a-egg', name: 'Egg', price_modifier: 20, display_order: 1 },
        { id: 'a-coke', name: '', price_modifier: 0, display_order: 2, menu_item_id: 'coke' },
      ],
    },
  ],
}

describe('priceLineModifiers — add-on breakdown', () => {
  it('lists each chosen add-on with its catalog price and portions', () => {
    const result = priceLineModifiers(
      {
        option_ids: ['o-big'],
        addon_ids: ['a-rice', 'a-egg'],
        addon_quantities: { 'a-rice': 2 },
        variation: 'Big',
        addons: ['Fried Rice ×2', 'Egg'],
      },
      silog,
      NO_LINKS
    )

    expect(result.addons).toEqual([
      { name: 'Fried Rice', price: 15, quantity: 2 },
      { name: 'Egg', price: 20, quantity: 1 },
    ])
    // Options are not add-ons: "Big" stays in the variation text only.
    expect(result.delta).toBe(30 + 30 + 20)
  })

  it('prices a linked add-on from the linked dish, under its name', () => {
    const links = new Map<string, LinkedModifierItem>([
      ['coke', { id: 'coke', name: 'Coke', price: 60, discounted_price: 45 }],
    ])

    const result = priceLineModifiers({ addon_ids: ['a-coke'], addons: ['Coke'] }, silog, links)

    expect(result.addons).toEqual([{ name: 'Coke', price: 45, quantity: 1 }])
  })

  it('prices an add-on named only in the text, as the charge does', () => {
    const result = priceLineModifiers({ addons: ['Egg ×3'] }, silog, NO_LINKS)

    expect(result.addons).toEqual([{ name: 'Egg', price: 20, quantity: 3 }])
    expect(result.delta).toBe(60)
  })

  it('keeps an add-on the dish no longer carries, with no price', () => {
    // A stale cart after the merchant deleted the add-on: the kitchen still
    // reads the label, so the breakdown keeps the name, but nothing was charged.
    const result = priceLineModifiers({ addon_ids: ['gone'], addons: ['Cheese'] }, silog, NO_LINKS)

    expect(result.addons).toEqual([{ name: 'Cheese', price: null, quantity: 1 }])
  })

  it('does not list an add-on twice when both its id and its label are sent', () => {
    const result = priceLineModifiers(
      { addon_ids: ['a-rice'], addon_quantities: { 'a-rice': 2 }, addons: ['Fried Rice ×2'] },
      silog,
      NO_LINKS
    )

    expect(result.addons).toEqual([{ name: 'Fried Rice', price: 15, quantity: 2 }])
  })

  it('is empty for a line with no add-ons', () => {
    expect(priceLineModifiers({ option_ids: ['o-big'], variation: 'Big' }, silog, NO_LINKS).addons).toEqual([])
  })

  it('reads legacy add-on prices from the price column', () => {
    const legacy: ModifierCatalogSource = { addons: [{ id: 'l-cheese', name: 'Cheese', price: 12 }] }

    const result = priceLineModifiers({ addon_ids: ['l-cheese'], addons: ['Cheese'] }, legacy, NO_LINKS)

    expect(result.addons).toEqual([{ name: 'Cheese', price: 12, quantity: 1 }])
  })
})

describe('priceOrderLines — addon_details on the priced line', () => {
  const context = (): PriceOrderLinesContext => ({
    storeItems: new Map([['silog', { id: 'silog', name: 'Tapsilog', price: 100, ...silog }]]),
    branchOverrides: new Map(),
    outletId: null,
    linkedItems: NO_LINKS,
  })

  it('attaches the server-priced breakdown to the line it bills', () => {
    const result = priceOrderLines<PriceableOrderLine>(
      [{
        menu_item_id: 'silog', menu_item_name: 'Tapsilog', price: 130, subtotal: 130, quantity: 1,
        addon_ids: ['a-rice'], addon_quantities: { 'a-rice': 2 }, addons: ['Fried Rice ×2'],
      }],
      context()
    )

    if (!result.ok) throw new Error(result.error)
    expect(result.lines[0].addon_details).toEqual([{ name: 'Fried Rice', price: 15, quantity: 2 }])
    expect(result.lines[0].subtotal).toBe(130)
  })

  it('replaces a breakdown the browser sent', () => {
    const result = priceOrderLines<PriceableOrderLine>(
      [{
        menu_item_id: 'silog', menu_item_name: 'Tapsilog', price: 100, subtotal: 100, quantity: 1,
        addons: [], addon_details: [{ name: 'Lobster', price: 0, quantity: 9 }],
      }],
      context()
    )

    if (!result.ok) throw new Error(result.error)
    expect(result.lines[0]).not.toHaveProperty('addon_details')
  })
})
