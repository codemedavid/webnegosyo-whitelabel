import { describe, test, expect } from '@jest/globals'
import {
  calculateCartItemSubtotal,
  calculateCartTotal,
  getCartItemCount,
  generateCartItemId,
  formatPrice,
  calculateSlotBundleBasePrice,
  calculateSlotBundleExtras,
  calculateSlotBundleSubtotal,
  calculateSlotBundleSavings,
  calculateTotalSlotBundleSavings,
  calculateFullCartTotal,
  getFullCartItemCount,
} from '@/lib/cart-utils'
import type { CartItem, CartBundleItem, CartBundleSlotSelection, VariationOption } from '@/types/database'
import { createTestMenuItem, createTestVariation, createTestAddon, createTestVariationOption } from '../../fixtures/menu-item.fixture'
import { createTestCartBundleItem, createTestSlotSelection } from '../../fixtures/bundle.fixture'

// ---- Tests ----

describe('cart-utils edge cases', () => {
  describe('calculateCartItemSubtotal edge cases', () => {
    test('handles zero base price', () => {
      expect(calculateCartItemSubtotal(0, undefined, [], 5)).toBe(0)
    })

    test('handles zero quantity', () => {
      expect(calculateCartItemSubtotal(100, undefined, [], 0)).toBe(0)
    })

    test('handles zero price modifier on legacy variation', () => {
      const variation = createTestVariation({ price_modifier: 0 })
      expect(calculateCartItemSubtotal(50, variation, [], 2)).toBe(100)
    })

    test('handles large quantities', () => {
      expect(calculateCartItemSubtotal(100, undefined, [], 1000)).toBe(100000)
    })

    test('handles fractional base price', () => {
      expect(calculateCartItemSubtotal(99.99, undefined, [], 1)).toBe(99.99)
    })

    test('handles multiple addons with zero-priced addon', () => {
      const addons = [
        createTestAddon({ price: 0 }),
        createTestAddon({ price: 25 }),
      ]
      expect(calculateCartItemSubtotal(100, undefined, addons, 1)).toBe(125)
    })

    test('handles grouped variations with zero modifiers', () => {
      const variations: { [typeId: string]: VariationOption } = {
        'type-1': createTestVariationOption({ price_modifier: 0 }),
        'type-2': createTestVariationOption({ price_modifier: 0 }),
      }
      expect(calculateCartItemSubtotal(100, variations, [], 2)).toBe(200)
    })

    test('handles combination of grouped variations and multiple addons', () => {
      const variations: { [typeId: string]: VariationOption } = {
        'size': createTestVariationOption({ price_modifier: 30 }),
        'spice': createTestVariationOption({ price_modifier: 5 }),
      }
      const addons = [
        createTestAddon({ price: 10 }),
        createTestAddon({ price: 15 }),
        createTestAddon({ price: 20 }),
      ]
      // (100 + 30 + 5 + 10 + 15 + 20) * 2 = 180 * 2 = 360
      expect(calculateCartItemSubtotal(100, variations, addons, 2)).toBe(360)
    })
  })

  describe('calculateCartTotal edge cases', () => {
    test('handles single item with zero subtotal', () => {
      const items: CartItem[] = [{
        id: '1',
        menu_item: createTestMenuItem(),
        selected_addons: [],
        quantity: 1,
        subtotal: 0,
      }]
      expect(calculateCartTotal(items)).toBe(0)
    })

    test('handles many items', () => {
      const items: CartItem[] = Array.from({ length: 50 }, (_, i) => ({
        id: `item-${i}`,
        menu_item: createTestMenuItem(),
        selected_addons: [],
        quantity: 1,
        subtotal: 10,
      }))
      expect(calculateCartTotal(items)).toBe(500)
    })
  })

  describe('getCartItemCount edge cases', () => {
    test('handles items with zero quantity', () => {
      const items: CartItem[] = [{
        id: '1',
        menu_item: createTestMenuItem(),
        selected_addons: [],
        quantity: 0,
        subtotal: 0,
      }]
      expect(getCartItemCount(items)).toBe(0)
    })
  })

  describe('generateCartItemId edge cases', () => {
    test('handles empty addon array', () => {
      expect(generateCartItemId('item-1', undefined, [])).toBe('item-1')
    })

    test('handles single addon', () => {
      expect(generateCartItemId('item-1', undefined, ['addon-1'])).toBe('item-1_addon-1')
    })

    test('handles both legacy variation and addons', () => {
      expect(generateCartItemId('item-1', 'var-1', ['addon-2', 'addon-1'])).toBe('item-1_var-1_addon-1-addon-2')
    })

    test('handles grouped variations with single type', () => {
      const variations: { [typeId: string]: VariationOption } = {
        'type-1': createTestVariationOption({ id: 'opt-1' }),
      }
      expect(generateCartItemId('item-1', variations)).toBe('item-1_type-1:opt-1')
    })
  })

  describe('formatPrice edge cases', () => {
    test('formats negative price', () => {
      const result = formatPrice(-50)
      expect(result).toContain('50.00')
    })

    test('formats very large price', () => {
      const result = formatPrice(1000000)
      expect(result).toContain('1,000,000.00')
    })

    test('formats with hideCurrencySymbol option', () => {
      const result = formatPrice(100, { hideCurrencySymbol: true })
      expect(result).toBe('100.00')
      expect(result).not.toContain('₱')
    })

    test('formats zero with hideCurrencySymbol option', () => {
      const result = formatPrice(0, { hideCurrencySymbol: true })
      expect(result).toBe('0.00')
    })
  })
})

describe('slot-based bundle pricing calculations', () => {
  describe('calculateSlotBundleBasePrice', () => {
    test('fixed pricing: returns basePrice directly', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'fixed',
        basePrice: 250,
        slots: [
          createTestSlotSelection({ menuItemPrice: 100, quantity: 1 }),
          createTestSlotSelection({ menuItemPrice: 150, quantity: 1 }),
        ],
      })
      expect(calculateSlotBundleBasePrice(bundleItem)).toBe(250)
    })

    test('discount pricing: calculates from slot menuItemPrices with discount', () => {
      // items 100+150=250, 20% off → 250*0.8=200
      const bundleItem = createTestCartBundleItem({
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 20,
        slots: [
          createTestSlotSelection({ menuItemPrice: 100, quantity: 1 }),
          createTestSlotSelection({ menuItemPrice: 150, quantity: 1 }),
        ],
      })
      expect(calculateSlotBundleBasePrice(bundleItem)).toBe(200)
    })

    test('discount pricing: 100% discount yields 0', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 100,
        slots: [
          createTestSlotSelection({ menuItemPrice: 200, quantity: 1 }),
        ],
      })
      expect(calculateSlotBundleBasePrice(bundleItem)).toBe(0)
    })

    test('discount pricing: 0% discount yields full price', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 0,
        slots: [
          createTestSlotSelection({ menuItemPrice: 150, quantity: 1 }),
          createTestSlotSelection({ menuItemPrice: 100, quantity: 1 }),
        ],
      })
      expect(calculateSlotBundleBasePrice(bundleItem)).toBe(250)
    })
  })

  describe('calculateSlotBundleExtras', () => {
    test('no extras → 0', () => {
      const slots: CartBundleSlotSelection[] = [
        createTestSlotSelection({ priceOverride: 0, selectedAddons: [] }),
      ]
      expect(calculateSlotBundleExtras(slots)).toBe(0)
    })

    test('price overrides only', () => {
      // 20+15=35
      const slots: CartBundleSlotSelection[] = [
        createTestSlotSelection({ priceOverride: 20, selectedAddons: [] }),
        createTestSlotSelection({ priceOverride: 15, selectedAddons: [] }),
      ]
      expect(calculateSlotBundleExtras(slots)).toBe(35)
    })

    test('addon prices only', () => {
      // 10+15=25
      const slots: CartBundleSlotSelection[] = [
        createTestSlotSelection({
          priceOverride: 0,
          selectedAddons: [
            createTestAddon({ price: 10 }),
            createTestAddon({ price: 15 }),
          ],
        }),
      ]
      expect(calculateSlotBundleExtras(slots)).toBe(25)
    })

    test('grouped variation modifiers', () => {
      // 30+10=40
      const slots: CartBundleSlotSelection[] = [
        createTestSlotSelection({
          priceOverride: 0,
          selectedVariations: {
            'size': createTestVariationOption({ price_modifier: 30 }),
            'type': createTestVariationOption({ price_modifier: 10 }),
          },
          selectedAddons: [],
        }),
      ]
      expect(calculateSlotBundleExtras(slots)).toBe(40)
    })

    test('legacy variation modifier', () => {
      const slots: CartBundleSlotSelection[] = [
        createTestSlotSelection({
          priceOverride: 0,
          selectedVariation: createTestVariation({ price_modifier: 25 }),
          selectedAddons: [],
        }),
      ]
      expect(calculateSlotBundleExtras(slots)).toBe(25)
    })

    test('combined: override + variation + addon', () => {
      // priceOverride=20, variation=15, addon=10 → 45
      const slots: CartBundleSlotSelection[] = [
        createTestSlotSelection({
          priceOverride: 20,
          selectedVariation: createTestVariation({ price_modifier: 15 }),
          selectedAddons: [createTestAddon({ price: 10 })],
        }),
      ]
      expect(calculateSlotBundleExtras(slots)).toBe(45)
    })

    test('multiple slots with various extras', () => {
      // slot1: override=20, addon=5 → 25
      // slot2: variation=10, addon=0 → 10
      // total: 35
      const slots: CartBundleSlotSelection[] = [
        createTestSlotSelection({
          priceOverride: 20,
          selectedAddons: [createTestAddon({ price: 5 })],
        }),
        createTestSlotSelection({
          slotId: 'slot-2',
          priceOverride: 0,
          selectedVariation: createTestVariation({ price_modifier: 10 }),
          selectedAddons: [],
        }),
      ]
      expect(calculateSlotBundleExtras(slots)).toBe(35)
    })
  })

  describe('calculateSlotBundleSubtotal', () => {
    test('fixed: (basePrice + extras) × quantity', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'fixed',
        basePrice: 200,
        slots: [createTestSlotSelection({ priceOverride: 0, selectedAddons: [] })],
        quantity: 2,
      })
      // (200 + 0) * 2 = 400
      expect(calculateSlotBundleSubtotal(bundleItem)).toBe(400)
    })

    test('fixed with extras and qty>1: (basePrice + extras) × quantity', () => {
      // (150 + 20 + 10) × 2 = 360
      const bundleItem = createTestCartBundleItem({
        pricingType: 'fixed',
        basePrice: 150,
        slots: [
          createTestSlotSelection({
            priceOverride: 20,
            selectedAddons: [createTestAddon({ price: 10 })],
          }),
        ],
        quantity: 2,
      })
      expect(calculateSlotBundleSubtotal(bundleItem)).toBe(360)
    })

    test('discount: (discountedTotal + extras) × quantity', () => {
      // items: 100+150=250, 20% off → 200, extras=0, qty=1 → 200
      const bundleItem = createTestCartBundleItem({
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 20,
        slots: [
          createTestSlotSelection({ menuItemPrice: 100, priceOverride: 0, selectedAddons: [] }),
          createTestSlotSelection({ slotId: 'slot-2', menuItemPrice: 150, priceOverride: 0, selectedAddons: [] }),
        ],
        quantity: 1,
      })
      expect(calculateSlotBundleSubtotal(bundleItem)).toBe(200)
    })
  })

  describe('calculateSlotBundleSavings', () => {
    test('fixed: originalTotal - basePrice', () => {
      // sum(menuItemPrices)=250, basePrice=200 → savings=50
      const bundleItem = createTestCartBundleItem({
        pricingType: 'fixed',
        basePrice: 200,
        slots: [
          createTestSlotSelection({ menuItemPrice: 100, quantity: 1, priceOverride: 0, selectedAddons: [] }),
          createTestSlotSelection({ slotId: 'slot-2', menuItemPrice: 150, quantity: 1, priceOverride: 0, selectedAddons: [] }),
        ],
      })
      expect(calculateSlotBundleSavings(bundleItem)).toBe(50)
    })

    test('discount: originalTotal - discountedTotal', () => {
      // items: 200, 25% off → 150, savings=50
      const bundleItem = createTestCartBundleItem({
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 25,
        slots: [
          createTestSlotSelection({ menuItemPrice: 200, quantity: 1, priceOverride: 0, selectedAddons: [] }),
        ],
      })
      expect(calculateSlotBundleSavings(bundleItem)).toBe(50)
    })

    test('returns 0 when base >= original', () => {
      // basePrice=500 > sum(menuItemPrices)=100 → savings=0
      const bundleItem = createTestCartBundleItem({
        pricingType: 'fixed',
        basePrice: 500,
        slots: [
          createTestSlotSelection({ menuItemPrice: 100, quantity: 1, priceOverride: 0, selectedAddons: [] }),
        ],
      })
      expect(calculateSlotBundleSavings(bundleItem)).toBe(0)
    })
  })

  describe('calculateTotalSlotBundleSavings', () => {
    test('sums savings across multiple bundle items', () => {
      // Bundle 1: items=300, fixed=200, savings=100 × qty1 = 100
      const b1 = createTestCartBundleItem({
        pricingType: 'fixed',
        basePrice: 200,
        slots: [
          createTestSlotSelection({ menuItemPrice: 150, quantity: 1, priceOverride: 0, selectedAddons: [] }),
          createTestSlotSelection({ slotId: 'slot-2', menuItemPrice: 150, quantity: 1, priceOverride: 0, selectedAddons: [] }),
        ],
        quantity: 1,
      })
      // Bundle 2: items=100, 20% off → base=80, savings=20 × qty2 = 40
      const b2 = createTestCartBundleItem({
        id: 'cart-bundle-2',
        bundleId: 'bundle-2',
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 20,
        slots: [
          createTestSlotSelection({ menuItemPrice: 100, quantity: 1, priceOverride: 0, selectedAddons: [] }),
        ],
        quantity: 2,
      })
      // total: 100 + 40 = 140
      expect(calculateTotalSlotBundleSavings([b1, b2])).toBe(140)
    })

    test('returns 0 for empty bundle list', () => {
      expect(calculateTotalSlotBundleSavings([])).toBe(0)
    })
  })

  describe('calculateFullCartTotal (new CartBundleItem shape)', () => {
    test('sums regular items and bundles', () => {
      const items: CartItem[] = [
        { id: '1', menu_item: createTestMenuItem(), selected_addons: [], quantity: 1, subtotal: 100 },
        { id: '2', menu_item: createTestMenuItem(), selected_addons: [], quantity: 1, subtotal: 200 },
      ]
      const bundleItems: CartBundleItem[] = [
        createTestCartBundleItem({ subtotal: 300 }),
      ]
      expect(calculateFullCartTotal(items, bundleItems)).toBe(600)
    })

    test('handles empty bundles', () => {
      const items: CartItem[] = [
        { id: '1', menu_item: createTestMenuItem(), selected_addons: [], quantity: 1, subtotal: 150 },
      ]
      expect(calculateFullCartTotal(items, [])).toBe(150)
    })

    test('handles empty regular items', () => {
      const bundleItems: CartBundleItem[] = [
        createTestCartBundleItem({ subtotal: 250 }),
      ]
      expect(calculateFullCartTotal([], bundleItems)).toBe(250)
    })

    test('handles both empty', () => {
      expect(calculateFullCartTotal([], [])).toBe(0)
    })
  })

  describe('getFullCartItemCount (new CartBundleItem shape)', () => {
    test('counts regular items and bundle slot items', () => {
      const items: CartItem[] = [
        { id: '1', menu_item: createTestMenuItem(), selected_addons: [], quantity: 2, subtotal: 200 },
      ]
      const bundleItems: CartBundleItem[] = [
        createTestCartBundleItem({
          slots: [
            createTestSlotSelection({ quantity: 2 }),
            createTestSlotSelection({ slotId: 'slot-2', quantity: 1 }),
          ],
          quantity: 1,
        }),
      ]
      // regular: 2, bundle: (2+1)*1 = 3, total = 5
      expect(getFullCartItemCount(items, bundleItems)).toBe(5)
    })

    test('multiplies bundle quantity by slot items in bundle', () => {
      const bundleItems: CartBundleItem[] = [
        createTestCartBundleItem({
          slots: [
            createTestSlotSelection({ quantity: 1 }),
            createTestSlotSelection({ slotId: 'slot-2', quantity: 1 }),
          ],
          quantity: 3,
        }),
      ]
      // (1+1)*3 = 6
      expect(getFullCartItemCount([], bundleItems)).toBe(6)
    })

    test('handles empty cart', () => {
      expect(getFullCartItemCount([], [])).toBe(0)
    })
  })
})
