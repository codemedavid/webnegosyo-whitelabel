import {
  buildCartLineOrderItem,
  buildOrderItemsPayload,
  toPresellPreflightLines,
  toStockPreflightLines,
} from '@/lib/checkout/order-items-payload'
import type { CartBundleItem, CartItem } from '@/types/database'

const LEGACY_LINE = {
  id: 'l1',
  menu_item: { id: 'm1', name: 'Adobo', price: 100, discounted_price: 90 },
  selected_variation: { id: 'v1', name: 'Large', price_modifier: 20 },
  selected_addons: [{ id: 'a1', name: 'Egg', price: 15, quantity: 2 }],
  quantity: 2,
  subtotal: 300,
  special_instructions: 'no onions',
  upsellSource: 'post_add',
  presell_date: '2026-10-10',
} as unknown as CartItem

const GROUPED_LINE = {
  id: 'l2',
  menu_item: { id: 'm2', name: 'Milk Tea', price: 80 },
  selected_variations: {
    size: { id: 'o1', name: 'Large', price_modifier: 10 },
    sugar: { id: 'o2', name: '50%', price_modifier: 0 },
  },
  selected_addons: [],
  quantity: 1,
  subtotal: 90,
} as unknown as CartItem

const BUNDLE = {
  id: 'b-cart-1',
  bundleId: 'bundle-1',
  bundleName: 'Family Meal',
  quantity: 1,
  slots: [
    {
      slotId: 'slot-1',
      slotName: 'Main',
      menuItemId: 'm9',
      menuItemName: 'Fried Chicken',
      menuItemImage: null,
      menuItemPrice: 150,
      quantity: 1,
      selectedAddons: [],
      priceOverride: 0,
    },
  ],
} as unknown as CartBundleItem

describe('buildCartLineOrderItem', () => {
  it('prices a line per unit including add-ons and carries every selection id', () => {
    expect(buildCartLineOrderItem(LEGACY_LINE)).toEqual({
      menu_item_id: 'm1',
      menu_item_name: 'Adobo',
      variation: 'Large',
      addons: ['Egg ×2'],
      quantity: 2,
      price: 140,
      subtotal: 300,
      special_instructions: 'no onions',
      option_ids: ['v1'],
      addon_ids: ['a1'],
      addon_quantities: { a1: 2 },
      isUpsellItem: true,
      presell_date: '2026-10-10',
    })
  })

  it('joins grouped variation names and leaves the optional keys absent', () => {
    const item = buildCartLineOrderItem(GROUPED_LINE)

    expect(item.variation).toBe('Large, 50%')
    expect(item.price).toBe(90)
    expect(item).not.toHaveProperty('isUpsellItem')
    expect(item).not.toHaveProperty('presell_date')
    expect(item).not.toHaveProperty('addon_quantities')
  })

  it('sends no variation text when the line has none', () => {
    const item = buildCartLineOrderItem({ ...GROUPED_LINE, selected_variations: undefined } as unknown as CartItem)

    expect(item.variation).toBeUndefined()
  })
})

describe('buildOrderItemsPayload', () => {
  it('lists cart lines first, then every bundle slot', () => {
    const payload = buildOrderItemsPayload([LEGACY_LINE, GROUPED_LINE], [BUNDLE])

    expect(payload.map(item => item.menu_item_id)).toEqual(['m1', 'm2', 'm9'])
    expect(payload[2]).toEqual(expect.objectContaining({ isBundleItem: true, bundleId: 'bundle-1', slotName: 'Main' }))
  })

  it('does not mutate its inputs', () => {
    const items = Object.freeze([LEGACY_LINE]) as readonly CartItem[]
    const bundles = Object.freeze([BUNDLE]) as readonly CartBundleItem[]

    expect(() => buildOrderItemsPayload(items, bundles)).not.toThrow()
  })
})

describe('preflight lines', () => {
  it('asks the stock check about each line by menu item and quantity', () => {
    expect(toStockPreflightLines([LEGACY_LINE, GROUPED_LINE])).toEqual([
      { menuItemId: 'm1', quantity: 2 },
      { menuItemId: 'm2', quantity: 1 },
    ])
  })

  it('asks the presell check with each line’s pickup date', () => {
    expect(toPresellPreflightLines([LEGACY_LINE, GROUPED_LINE])).toEqual([
      { menuItemId: 'm1', quantity: 2, presellDate: '2026-10-10' },
      { menuItemId: 'm2', quantity: 1, presellDate: undefined },
    ])
  })
})
