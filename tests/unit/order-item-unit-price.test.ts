/**
 * Regression: add-on prices were being dropped from the order total.
 *
 * Reported by a merchant: a Cappuccino with a ₱15 "Oat Milk" add-on saved as
 * ₱110 instead of ₱125. Root cause: checkout sent a per-unit `price` that
 * included the base price + variation modifiers but NOT add-ons, while the
 * server enforces `subtotal = price × quantity` and recomputes the order total
 * from the clamped subtotals — silently deleting the add-on money.
 *
 * The guarantee locked in here: the per-unit price of a configured cart line
 * includes add-ons, so the server's `subtotal = price × quantity` invariant
 * holds and no money is lost.
 */
import type { Addon, MenuItem, Variation, VariationOption } from '@/types/database'
import {
  calculateCartItemUnitPrice,
  calculateCartItemSubtotal,
  makeCartItem,
} from '@/lib/cart-utils'

// ---- Fixtures -------------------------------------------------------------

const oatMilk: Addon = { id: 'addon-oat', name: 'Oat Milk', price: 15 }
const extraShot: Addon = { id: 'addon-shot', name: 'Extra Shot', price: 25 }
const freeSyrup: Addon = { id: 'addon-syrup', name: 'Vanilla Syrup', price: 0 }

const size16oz: VariationOption = {
  id: 'opt-16oz',
  name: '16oz',
  price_modifier: 20,
  display_order: 0,
}

const mild: VariationOption = {
  id: 'opt-mild',
  name: 'Mild',
  price_modifier: 0,
  display_order: 0,
}

const legacyLarge: Variation = {
  id: 'var-large',
  name: 'Large',
  price_modifier: 30,
}

function makeCappuccino(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-cappuccino',
    tenant_id: 'tenant-1',
    category_id: 'cat-coffee',
    name: 'Cappuccino',
    description: 'Espresso with steamed milk',
    price: 110,
    image_url: '',
    variation_types: [],
    variations: [],
    addons: [oatMilk, extraShot, freeSyrup],
    is_available: true,
    order: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

/** Mirrors the server-side clamp in orders-service / actions/orders. */
function serverEnforcedSubtotal(unitPrice: number, quantity: number): number {
  return Math.round(unitPrice * quantity * 100) / 100
}

// ---- Tests ----------------------------------------------------------------

describe('calculateCartItemUnitPrice', () => {
  it('includes add-on prices in the per-unit price', () => {
    // Arrange — the exact reported configuration: ₱110 coffee + ₱15 oat milk
    const item = makeCappuccino()

    // Act
    const unitPrice = calculateCartItemUnitPrice(item.price, undefined, [oatMilk])

    // Assert
    expect(unitPrice).toBe(125)
  })

  it('sums grouped variation modifiers and add-ons together', () => {
    const item = makeCappuccino()

    const unitPrice = calculateCartItemUnitPrice(
      item.price,
      { 'type-size': size16oz, 'type-strength': mild },
      [oatMilk, extraShot]
    )

    // 110 base + 20 (16oz) + 0 (mild) + 15 + 25
    expect(unitPrice).toBe(170)
  })

  it('supports the legacy single-variation format', () => {
    const unitPrice = calculateCartItemUnitPrice(110, legacyLarge, [oatMilk])

    expect(unitPrice).toBe(155)
  })

  it('returns the base price when there are no variations or add-ons', () => {
    expect(calculateCartItemUnitPrice(110, undefined, [])).toBe(110)
  })

  it('ignores free add-ons in the price while keeping the base intact', () => {
    expect(calculateCartItemUnitPrice(110, undefined, [freeSyrup])).toBe(110)
  })

  it('rounds to cents', () => {
    expect(calculateCartItemUnitPrice(10.1, undefined, [{ id: 'a', name: 'A', price: 0.2 }])).toBe(10.3)
  })
})

describe('order pricing invariant: subtotal = unit price × quantity', () => {
  it('preserves add-on money when the server recomputes the subtotal (qty 1)', () => {
    // Arrange — cart line as built by add-to-cart
    const item = makeCappuccino()
    const cartItem = makeCartItem(item, undefined, [oatMilk], 1)

    // Act — what the server would store after enforcing its invariant
    const unitPrice = calculateCartItemUnitPrice(item.price, undefined, cartItem.selected_addons)
    const storedSubtotal = serverEnforcedSubtotal(unitPrice, cartItem.quantity)

    // Assert — nothing is lost
    expect(cartItem.subtotal).toBe(125)
    expect(storedSubtotal).toBe(cartItem.subtotal)
  })

  it('preserves add-on money for multi-quantity lines with variations', () => {
    const item = makeCappuccino()
    const variations = { 'type-size': size16oz }
    const addons = [oatMilk, extraShot]
    const cartItem = makeCartItem(item, variations, addons, 3)

    const unitPrice = calculateCartItemUnitPrice(item.price, variations, addons)
    const storedSubtotal = serverEnforcedSubtotal(unitPrice, cartItem.quantity)

    expect(cartItem.subtotal).toBe(calculateCartItemSubtotal(item.price, variations, addons, 3))
    expect(storedSubtotal).toBe(cartItem.subtotal)
  })
})
