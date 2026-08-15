/**
 * Flattening bundle cart items into order items — with their selection ids.
 *
 * The defect: `useCheckout` pushed bundle-slot order items WITHOUT
 * `option_ids` / `addon_ids` while regular items carried them, so a bundled
 * item depleted only its base recipe. The mapping is extracted here as a pure
 * function so the payload can be pinned without mounting the 1300-line hook.
 */

import { flattenBundleOrderItems } from '@/lib/bundle-order-items'
import type { CartBundleItem, CartBundleSlotSelection } from '@/types/database'

const slot = (over: Partial<CartBundleSlotSelection>): CartBundleSlotSelection =>
  ({
    slotId: 's1', slotName: 'Main', menuItemId: 'm-pizza', menuItemName: 'Pizza',
    menuItemImage: null, menuItemPrice: 250, quantity: 1, selectedAddons: [],
    priceOverride: 200,
    ...over,
  }) as CartBundleSlotSelection

const bundle = (over: Partial<CartBundleItem>): CartBundleItem =>
  ({
    id: 'cb1', bundleId: 'b1', bundleName: 'Family Meal', slots: [],
    quantity: 1, pricingType: 'fixed', basePrice: 500, subtotal: 500,
    ...over,
  }) as CartBundleItem

describe('flattenBundleOrderItems', () => {
  it('carries the slot-s selected option and addon ids into the order item', () => {
    // Arrange — a bundled pizza with a chosen size and a chosen addon.
    const bundles = [
      bundle({
        slots: [
          slot({
            selectedVariations: {
              'type-size': { id: 'opt-large', name: 'Large', price_modifier: 50 },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            selectedAddons: [{ id: 'add-cheese', name: 'Extra Cheese', price: 15 }] as any,
          }),
        ],
      }),
    ]

    // Act
    const items = flattenBundleOrderItems(bundles)

    // Assert — the ids inventory depletion resolves recipes against.
    expect(items).toHaveLength(1)
    expect(items[0].option_ids).toEqual(['opt-large'])
    expect(items[0].addon_ids).toEqual(['add-cheese'])
  })

  it('prices the slot exactly as the checkout inline loop did', () => {
    // priceOverride + variation modifier + addon total, quantity multiplied
    // through both the slot and the bundle.
    const bundles = [
      bundle({
        quantity: 2,
        slots: [
          slot({
            quantity: 3,
            priceOverride: 200,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            selectedVariation: { id: 'var-large', name: 'Large', price_modifier: 50 } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            selectedAddons: [{ id: 'add-cheese', name: 'Extra Cheese', price: 15 }] as any,
          }),
        ],
      }),
    ]

    const [item] = flattenBundleOrderItems(bundles)

    expect(item.price).toBe(265) // 200 + 50 + 15
    expect(item.quantity).toBe(6) // 3 × 2
    expect(item.subtotal).toBe(1590) // 265 × 6
    expect(item.variation).toBe('Large')
    expect(item.addons).toEqual(['Extra Cheese'])
  })

  it('marks every row as a bundle item with its provenance', () => {
    const [item] = flattenBundleOrderItems([bundle({ slots: [slot({})] })])

    expect(item.isBundleItem).toBe(true)
    expect(item.bundleId).toBe('b1')
    expect(item.bundleName).toBe('Family Meal')
    expect(item.slotName).toBe('Main')
  })

  it('joins grouped variation names for the display string', () => {
    const [item] = flattenBundleOrderItems([
      bundle({
        slots: [
          slot({
            selectedVariations: {
              'type-size': { id: 'opt-large', name: 'Large', price_modifier: 50 },
              'type-crust': { id: 'opt-thin', name: 'Thin', price_modifier: 0 },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          }),
        ],
      }),
    ])

    expect(item.variation).toBe('Large, Thin')
    expect(item.price).toBe(250) // 200 + 50 + 0
  })

  it('leaves variation undefined and lists empty for a plain slot', () => {
    const [item] = flattenBundleOrderItems([bundle({ slots: [slot({})] })])

    expect(item.variation).toBeUndefined()
    expect(item.option_ids).toEqual([])
    expect(item.addon_ids).toEqual([])
  })

  it('returns nothing for no bundles', () => {
    expect(flattenBundleOrderItems([])).toEqual([])
  })
})
