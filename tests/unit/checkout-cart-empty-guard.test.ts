import type { CartItem, CartBundleItem } from '@/types/database'
import { isCheckoutCartEmpty } from '@/lib/cart-utils'

// ---- Fixtures -------------------------------------------------------------

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'cart-item-1',
    menu_item: { id: 'item-1', name: 'Corned Beef Silog' } as CartItem['menu_item'],
    quantity: 1,
    subtotal: 79,
    selected_addons: [],
    ...overrides,
  } as CartItem
}

function makeBundleItem(overrides: Partial<CartBundleItem> = {}): CartBundleItem {
  return {
    id: 'bundle-cart-1',
    bundleId: 'bundle-1',
    bundleName: 'Island Silog + Drink Combo',
    slots: [
      {
        slotId: 'slot-silog',
        slotName: 'Pick 1 Silog Meal',
        menuItemId: 'item-1',
        menuItemName: 'Corned Beef Silog',
        menuItemImage: null,
        menuItemPrice: 79,
        selectedAddons: [],
        priceOverride: 79,
        quantity: 1,
      },
    ],
    quantity: 1,
    pricingType: 'discount',
    basePrice: 0,
    discountPercent: 10,
    subtotal: 124.2,
    ...overrides,
  }
}

// ---- Tests ----------------------------------------------------------------

describe('isCheckoutCartEmpty', () => {
  it('returns true when both regular items and bundles are empty', () => {
    expect(isCheckoutCartEmpty([], [])).toBe(true)
  })

  it('returns false when there is a regular item', () => {
    expect(isCheckoutCartEmpty([makeCartItem()], [])).toBe(false)
  })

  // Regression: bundle-only carts must NOT be treated as empty. Previously the
  // checkout redirect only inspected `items`, so a bundle-only cart bounced the
  // customer back to the menu.
  it('returns false when the cart contains ONLY a bundle', () => {
    expect(isCheckoutCartEmpty([], [makeBundleItem()])).toBe(false)
  })

  it('returns false when the cart has both a regular item and a bundle', () => {
    expect(isCheckoutCartEmpty([makeCartItem()], [makeBundleItem()])).toBe(false)
  })
})
