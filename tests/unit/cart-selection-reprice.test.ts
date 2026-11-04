import { describe, it, expect } from '@jest/globals'
import { repriceCartSelections } from '@/lib/cart-selection-reprice'
import type { CartItem, MenuItem } from '@/types/database'

/**
 * A saved cart kept the add-on and option prices from when it was filled. The
 * refresh re-read the dish's own price only, so after the merchant raised
 * "Fried Rice" from ₱15 to ₱20 the cart still said ₱130 while the server
 * (pricing from the menu) quietly billed ₱140. Selections are re-priced by id.
 */

const menuItem = { id: 'silog', name: 'Tapsilog', price: 100 } as MenuItem

const cartItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 'line-1',
  menu_item: menuItem,
  quantity: 1,
  subtotal: 130,
  selected_addons: [{ id: 'a-rice', name: 'Fried Rice', price: 15, quantity: 2 }],
  selected_variations: { 'g-size': { id: 'o-big', name: 'Big', price_modifier: 0, display_order: 1 } },
  ...overrides,
}) as CartItem

const fresh = {
  modifier_groups: [
    {
      id: 'g-size', name: 'Size', display_order: 0, min_select: 1, max_select: 1,
      options: [{ id: 'o-big', name: 'Big', price_modifier: 10, display_order: 1 }],
    },
    {
      id: 'g-addons', name: 'Add-ons', selection_mode: 'quantity' as const, display_order: 1, min_select: 0, max_select: null,
      options: [
        { id: 'a-rice', name: 'Fried Rice', price_modifier: 20, display_order: 0 },
        { id: 'a-coke', name: 'Coke', price_modifier: 0, display_order: 1, menu_item_id: 'coke' },
      ],
    },
  ],
}

describe('repriceCartSelections', () => {
  it('takes the current price of every chosen add-on and option, keeping portions', () => {
    const result = repriceCartSelections(cartItem(), fresh)

    expect(result.selected_addons).toEqual([{ id: 'a-rice', name: 'Fried Rice', price: 20, quantity: 2 }])
    expect(result.selected_variations?.['g-size'].price_modifier).toBe(10)
  })

  it('returns the very same item when nothing changed', () => {
    const item = cartItem({
      selected_addons: [{ id: 'a-rice', name: 'Fried Rice', price: 20, quantity: 2 }],
      selected_variations: { 'g-size': { id: 'o-big', name: 'Big', price_modifier: 10, display_order: 1 } },
    })

    expect(repriceCartSelections(item, fresh)).toBe(item)
  })

  it('leaves a linked add-on alone: its price lives on the linked dish', () => {
    const item = cartItem({ selected_addons: [{ id: 'a-coke', name: 'Coke', price: 45 }], selected_variations: undefined })

    expect(repriceCartSelections(item, fresh)).toBe(item)
  })

  it('leaves a selection the dish no longer carries as it was', () => {
    const item = cartItem({ selected_addons: [{ id: 'gone', name: 'Cheese', price: 12 }], selected_variations: undefined })

    expect(repriceCartSelections(item, fresh)).toBe(item)
  })

  it('re-prices a legacy single variation and legacy add-ons', () => {
    const item = cartItem({
      selected_variations: undefined,
      selected_variation: { id: 'v-large', name: 'Large', price_modifier: 30 },
      selected_addons: [{ id: 'l-egg', name: 'Egg', price: 10 }],
    })
    const legacy = {
      variations: [{ id: 'v-large', name: 'Large', price_modifier: 35 }],
      addons: [{ id: 'l-egg', name: 'Egg', price: 12 }],
    }

    const result = repriceCartSelections(item, legacy)

    expect(result.selected_variation?.price_modifier).toBe(35)
    expect(result.selected_addons[0].price).toBe(12)
  })
})
