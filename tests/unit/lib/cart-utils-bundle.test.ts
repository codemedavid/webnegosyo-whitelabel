import { describe, test, expect } from '@jest/globals'
import {
  calculateCartItemSubtotal,
  calculateCartTotal,
  getCartItemCount,
  generateCartItemId,
  formatPrice,
  calculateBundleBasePrice,
  calculateBundleOriginalTotal,
  calculateBundleExtras,
  calculateBundleSubtotal,
  calculateBundleSavings,
  calculateFullCartTotal,
  getFullCartItemCount,
  calculateTotalBundleSavings,
} from '@/lib/cart-utils'
import type { CartItem, CartBundleItem, Bundle, BundleItemCustomization, VariationOption } from '@/types/database'
import { createTestMenuItem, createTestVariation, createTestAddon, createTestVariationOption } from '../../fixtures/menu-item.fixture'

// ---- Helper factories ----

function createBundle(overrides: Partial<Bundle> = {}): Bundle {
  return {
    id: 'bundle-1',
    tenant_id: 'tenant-1',
    name: 'Test Bundle',
    description: 'A bundle',
    image_url: 'https://example.com/bundle.jpg',
    pricing_type: 'fixed',
    fixed_price: 200,
    discount_percent: undefined,
    is_active: true,
    show_on_menu: true,
    show_as_upsell: false,
    display_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function createCustomization(overrides: Partial<BundleItemCustomization> = {}): BundleItemCustomization {
  return {
    menu_item: createTestMenuItem({ price: 100 }),
    selected_addons: [],
    quantity: 1,
    ...overrides,
  }
}

function createCartBundleItem(overrides: Partial<CartBundleItem> = {}): CartBundleItem {
  const bundle = overrides.bundle ?? createBundle()
  const customizations = overrides.customizations ?? [createCustomization()]
  const quantity = overrides.quantity ?? 1
  const subtotal = overrides.subtotal ?? calculateBundleSubtotalHelper(bundle, customizations, quantity)
  return { id: 'cart-bundle-1', bundle, customizations, quantity, subtotal, ...overrides }
}

// Helper to compute subtotal for factory
function calculateBundleSubtotalHelper(bundle: Bundle, customizations: BundleItemCustomization[], quantity: number): number {
  const originalTotal = customizations.reduce((sum, c) => sum + c.menu_item.price * c.quantity, 0)
  let basePrice: number
  if (bundle.pricing_type === 'fixed') {
    basePrice = bundle.fixed_price ?? 0
  } else {
    basePrice = originalTotal * (1 - ((bundle.discount_percent ?? 0) / 100))
  }
  let extras = 0
  for (const c of customizations) {
    let variationExtra = 0
    if (c.selected_variations) {
      variationExtra = Object.values(c.selected_variations).reduce((s, opt) => s + opt.price_modifier, 0)
    } else if (c.selected_variation) {
      variationExtra = c.selected_variation.price_modifier || 0
    }
    const addonExtra = c.selected_addons.reduce((s, a) => s + a.price, 0)
    extras += (variationExtra + addonExtra) * c.quantity
  }
  return (basePrice + extras) * quantity
}

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

describe('bundle pricing calculations', () => {
  describe('calculateBundleBasePrice', () => {
    test('returns fixed price for fixed pricing type', () => {
      const bundle = createBundle({ pricing_type: 'fixed', fixed_price: 250 })
      expect(calculateBundleBasePrice(bundle, 500)).toBe(250)
    })

    test('returns 0 when fixed price is null', () => {
      const bundle = createBundle({ pricing_type: 'fixed', fixed_price: undefined })
      expect(calculateBundleBasePrice(bundle, 500)).toBe(0)
    })

    test('calculates discount price correctly', () => {
      const bundle = createBundle({ pricing_type: 'discount', discount_percent: 20 })
      // 500 * (1 - 0.2) = 400
      expect(calculateBundleBasePrice(bundle, 500)).toBe(400)
    })

    test('handles 0% discount', () => {
      const bundle = createBundle({ pricing_type: 'discount', discount_percent: 0 })
      expect(calculateBundleBasePrice(bundle, 500)).toBe(500)
    })

    test('handles 100% discount', () => {
      const bundle = createBundle({ pricing_type: 'discount', discount_percent: 100 })
      expect(calculateBundleBasePrice(bundle, 500)).toBe(0)
    })

    test('handles null discount percent', () => {
      const bundle = createBundle({ pricing_type: 'discount', discount_percent: undefined })
      // 1 - (0/100) = 1, so full price
      expect(calculateBundleBasePrice(bundle, 500)).toBe(500)
    })

    test('handles zero original total with discount', () => {
      const bundle = createBundle({ pricing_type: 'discount', discount_percent: 20 })
      expect(calculateBundleBasePrice(bundle, 0)).toBe(0)
    })
  })

  describe('calculateBundleOriginalTotal', () => {
    test('sums item prices times quantities', () => {
      const customizations: BundleItemCustomization[] = [
        createCustomization({ menu_item: createTestMenuItem({ price: 100 }), quantity: 2 }),
        createCustomization({ menu_item: createTestMenuItem({ price: 50 }), quantity: 1 }),
      ]
      expect(calculateBundleOriginalTotal(customizations)).toBe(250)
    })

    test('handles single item', () => {
      const customizations = [createCustomization({ menu_item: createTestMenuItem({ price: 150 }), quantity: 1 })]
      expect(calculateBundleOriginalTotal(customizations)).toBe(150)
    })

    test('handles empty customizations', () => {
      expect(calculateBundleOriginalTotal([])).toBe(0)
    })

    test('handles zero price items', () => {
      const customizations = [createCustomization({ menu_item: createTestMenuItem({ price: 0 }), quantity: 3 })]
      expect(calculateBundleOriginalTotal(customizations)).toBe(0)
    })
  })

  describe('calculateBundleExtras', () => {
    test('returns 0 for no extras', () => {
      const customizations = [createCustomization()]
      expect(calculateBundleExtras(customizations)).toBe(0)
    })

    test('calculates addon extras', () => {
      const customizations = [
        createCustomization({
          selected_addons: [createTestAddon({ price: 10 }), createTestAddon({ price: 15 })],
          quantity: 2,
        }),
      ]
      // (10 + 15) * 2 = 50
      expect(calculateBundleExtras(customizations)).toBe(50)
    })

    test('calculates legacy variation extras', () => {
      const customizations = [
        createCustomization({
          selected_variation: createTestVariation({ price_modifier: 20 }),
          quantity: 1,
        }),
      ]
      expect(calculateBundleExtras(customizations)).toBe(20)
    })

    test('calculates grouped variation extras', () => {
      const customizations = [
        createCustomization({
          selected_variations: {
            'size': createTestVariationOption({ price_modifier: 30 }),
            'type': createTestVariationOption({ price_modifier: 10 }),
          },
          quantity: 1,
        }),
      ]
      expect(calculateBundleExtras(customizations)).toBe(40)
    })

    test('calculates combined variation and addon extras', () => {
      const customizations = [
        createCustomization({
          selected_variations: {
            'size': createTestVariationOption({ price_modifier: 20 }),
          },
          selected_addons: [createTestAddon({ price: 10 })],
          quantity: 3,
        }),
      ]
      // (20 + 10) * 3 = 90
      expect(calculateBundleExtras(customizations)).toBe(90)
    })

    test('handles multiple customizations with extras', () => {
      const customizations = [
        createCustomization({
          selected_addons: [createTestAddon({ price: 10 })],
          quantity: 1,
        }),
        createCustomization({
          selected_variation: createTestVariation({ price_modifier: 15 }),
          quantity: 2,
        }),
      ]
      // item1: 10 * 1 = 10, item2: 15 * 2 = 30, total = 40
      expect(calculateBundleExtras(customizations)).toBe(40)
    })
  })

  describe('calculateBundleSubtotal', () => {
    test('calculates subtotal for fixed price bundle', () => {
      const bundle = createBundle({ pricing_type: 'fixed', fixed_price: 200 })
      const customizations = [
        createCustomization({ menu_item: createTestMenuItem({ price: 150 }), quantity: 1 }),
        createCustomization({ menu_item: createTestMenuItem({ price: 100 }), quantity: 1 }),
      ]
      const bundleItem: CartBundleItem = {
        id: 'cb-1',
        bundle,
        customizations,
        quantity: 1,
        subtotal: 0, // will be recalculated
      }
      // base=200, extras=0, quantity=1 -> 200
      expect(calculateBundleSubtotal(bundleItem)).toBe(200)
    })

    test('calculates subtotal for discount bundle', () => {
      const bundle = createBundle({ pricing_type: 'discount', discount_percent: 10 })
      const customizations = [
        createCustomization({ menu_item: createTestMenuItem({ price: 100 }), quantity: 1 }),
        createCustomization({ menu_item: createTestMenuItem({ price: 100 }), quantity: 1 }),
      ]
      const bundleItem: CartBundleItem = {
        id: 'cb-1',
        bundle,
        customizations,
        quantity: 2,
        subtotal: 0,
      }
      // original=200, base=200*0.9=180, extras=0, quantity=2 -> 360
      expect(calculateBundleSubtotal(bundleItem)).toBe(360)
    })

    test('includes extras in subtotal', () => {
      const bundle = createBundle({ pricing_type: 'fixed', fixed_price: 150 })
      const customizations = [
        createCustomization({
          menu_item: createTestMenuItem({ price: 100 }),
          selected_addons: [createTestAddon({ price: 20 })],
          quantity: 1,
        }),
      ]
      const bundleItem: CartBundleItem = {
        id: 'cb-1',
        bundle,
        customizations,
        quantity: 1,
        subtotal: 0,
      }
      // base=150, extras=20, quantity=1 -> 170
      expect(calculateBundleSubtotal(bundleItem)).toBe(170)
    })
  })

  describe('calculateBundleSavings', () => {
    test('calculates savings for fixed price bundle', () => {
      const bundle = createBundle({ pricing_type: 'fixed', fixed_price: 200 })
      const customizations = [
        createCustomization({ menu_item: createTestMenuItem({ price: 150 }), quantity: 1 }),
        createCustomization({ menu_item: createTestMenuItem({ price: 100 }), quantity: 1 }),
      ]
      // original=250, base=200, savings=50
      expect(calculateBundleSavings(bundle, customizations)).toBe(50)
    })

    test('calculates savings for discount bundle', () => {
      const bundle = createBundle({ pricing_type: 'discount', discount_percent: 25 })
      const customizations = [
        createCustomization({ menu_item: createTestMenuItem({ price: 200 }), quantity: 1 }),
      ]
      // original=200, base=200*0.75=150, savings=50
      expect(calculateBundleSavings(bundle, customizations)).toBe(50)
    })

    test('returns 0 when no savings (fixed price >= original)', () => {
      const bundle = createBundle({ pricing_type: 'fixed', fixed_price: 500 })
      const customizations = [
        createCustomization({ menu_item: createTestMenuItem({ price: 100 }), quantity: 1 }),
      ]
      // original=100, base=500, savings=max(0, 100-500)=0
      expect(calculateBundleSavings(bundle, customizations)).toBe(0)
    })

    test('returns 0 for 0% discount', () => {
      const bundle = createBundle({ pricing_type: 'discount', discount_percent: 0 })
      const customizations = [
        createCustomization({ menu_item: createTestMenuItem({ price: 100 }), quantity: 1 }),
      ]
      expect(calculateBundleSavings(bundle, customizations)).toBe(0)
    })
  })

  describe('calculateFullCartTotal', () => {
    test('sums regular items and bundles', () => {
      const items: CartItem[] = [
        { id: '1', menu_item: createTestMenuItem(), selected_addons: [], quantity: 1, subtotal: 100 },
        { id: '2', menu_item: createTestMenuItem(), selected_addons: [], quantity: 1, subtotal: 200 },
      ]
      const bundleItems: CartBundleItem[] = [
        createCartBundleItem({ subtotal: 300 }),
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
        createCartBundleItem({ subtotal: 250 }),
      ]
      expect(calculateFullCartTotal([], bundleItems)).toBe(250)
    })

    test('handles both empty', () => {
      expect(calculateFullCartTotal([], [])).toBe(0)
    })
  })

  describe('getFullCartItemCount', () => {
    test('counts regular items and bundle items', () => {
      const items: CartItem[] = [
        { id: '1', menu_item: createTestMenuItem(), selected_addons: [], quantity: 2, subtotal: 200 },
      ]
      const bundleItems: CartBundleItem[] = [
        createCartBundleItem({
          customizations: [
            createCustomization({ quantity: 2 }),
            createCustomization({ quantity: 1 }),
          ],
          quantity: 1,
        }),
      ]
      // regular: 2, bundle: (2+1)*1 = 3, total = 5
      expect(getFullCartItemCount(items, bundleItems)).toBe(5)
    })

    test('multiplies bundle quantity by items in bundle', () => {
      const bundleItems: CartBundleItem[] = [
        createCartBundleItem({
          customizations: [
            createCustomization({ quantity: 1 }),
            createCustomization({ quantity: 1 }),
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

  describe('calculateTotalBundleSavings', () => {
    test('sums savings across multiple bundles', () => {
      // Bundle 1: fixed 200, items worth 300 -> saves 100
      const b1 = createCartBundleItem({
        bundle: createBundle({ pricing_type: 'fixed', fixed_price: 200 }),
        customizations: [
          createCustomization({ menu_item: createTestMenuItem({ price: 150 }), quantity: 1 }),
          createCustomization({ menu_item: createTestMenuItem({ price: 150 }), quantity: 1 }),
        ],
        quantity: 1,
        subtotal: 200,
      })
      // Bundle 2: 20% off items worth 100 -> saves 20, qty 2 -> 40
      const b2 = createCartBundleItem({
        id: 'cart-bundle-2',
        bundle: createBundle({ id: 'b2', pricing_type: 'discount', discount_percent: 20 }),
        customizations: [
          createCustomization({ menu_item: createTestMenuItem({ price: 100 }), quantity: 1 }),
        ],
        quantity: 2,
        subtotal: 160,
      })
      // total savings: 100*1 + 20*2 = 140
      expect(calculateTotalBundleSavings([b1, b2])).toBe(140)
    })

    test('returns 0 for empty bundle list', () => {
      expect(calculateTotalBundleSavings([])).toBe(0)
    })
  })
})
