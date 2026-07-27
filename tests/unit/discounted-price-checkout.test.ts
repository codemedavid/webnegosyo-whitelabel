/**
 * Regression: items on sale checked out at their original price.
 *
 * Reported by a merchant: a menu item with `discounted_price` set showed the
 * sale price everywhere on the storefront (cards, product detail), but the cart
 * line subtotal and the per-unit `price` written onto the order both used
 * `menu_item.price` — so the customer was charged the pre-sale amount.
 *
 * The guarantee locked in here: the *effective* price of a menu item (sale
 * price when a valid one is set, list price otherwise) is what drives cart
 * subtotals and the per-unit order price.
 */
import type { Addon, MenuItem, VariationOption } from '@/types/database'
import {
  getEffectiveItemPrice,
  makeCartItem,
  replaceCartItem,
  calculateCartItemUnitPrice,
} from '@/lib/cart-utils'

// ---- Fixtures -------------------------------------------------------------

const oatMilk: Addon = { id: 'addon-oat', name: 'Oat Milk', price: 15 }

const large: VariationOption = {
  id: 'opt-large',
  name: 'Large',
  price_modifier: 20,
  display_order: 0,
}

const small: VariationOption = {
  id: 'opt-small',
  name: 'Small',
  price_modifier: 0,
  display_order: 0,
}

function makeItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-latte',
    tenant_id: 'tenant-1',
    category_id: 'cat-coffee',
    name: 'Latte',
    description: '',
    price: 200,
    image_url: '',
    variation_types: [],
    variations: [],
    addons: [oatMilk],
    is_available: true,
    order: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

// ---- getEffectiveItemPrice ------------------------------------------------

describe('getEffectiveItemPrice', () => {
  it('returns the sale price when the item is on sale', () => {
    // Arrange
    const item = makeItem({ price: 200, discounted_price: 150 })

    // Act / Assert
    expect(getEffectiveItemPrice(item)).toBe(150)
  })

  it('returns the list price when no discount is set', () => {
    expect(getEffectiveItemPrice(makeItem({ price: 200 }))).toBe(200)
  })

  it('ignores a discount that is not lower than the list price', () => {
    expect(getEffectiveItemPrice(makeItem({ price: 200, discounted_price: 250 }))).toBe(200)
  })

  it('ignores a zero or negative discount', () => {
    expect(getEffectiveItemPrice(makeItem({ price: 200, discounted_price: 0 }))).toBe(200)
    expect(getEffectiveItemPrice(makeItem({ price: 200, discounted_price: -5 }))).toBe(200)
  })
})

// ---- Cart line subtotal ---------------------------------------------------

describe('makeCartItem with a discounted menu item', () => {
  it('prices the line at the sale price', () => {
    // Arrange — ₱200 latte on sale for ₱150, two of them
    const item = makeItem({ price: 200, discounted_price: 150 })

    // Act
    const cartItem = makeCartItem(item, undefined, [], 2)

    // Assert
    expect(cartItem.subtotal).toBe(300)
  })

  it('adds variation modifiers and add-ons on top of the sale price', () => {
    // Arrange
    const item = makeItem({ price: 200, discounted_price: 150 })

    // Act — sale 150 + large 20 + oat milk 15 = 185
    const cartItem = makeCartItem(item, { 'type-size': large }, [oatMilk], 1)

    // Assert
    expect(cartItem.subtotal).toBe(185)
  })

  it('still uses the list price when the item is not on sale', () => {
    const item = makeItem({ price: 200 })
    expect(makeCartItem(item, undefined, [], 2).subtotal).toBe(400)
  })
})

// ---- Merging edited lines -------------------------------------------------

describe('replaceCartItem with a discounted menu item', () => {
  it('reprices a merged line at the sale price', () => {
    // Arrange — two lines of the same discounted item, edited to collide
    const item = makeItem({ price: 200, discounted_price: 150 })
    const smallLine = makeCartItem(item, { 'type-size': small }, [], 1)
    const largeLine = makeCartItem(item, { 'type-size': large }, [], 1)
    const cart = [smallLine, largeLine]

    // Act — edit the small line to Large so it merges into the large line
    const edited = makeCartItem(item, { 'type-size': large }, [], 1)
    const result = replaceCartItem(cart, smallLine.id, edited)

    // Assert — 2 × (150 sale + 20 large) = 340
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(2)
    expect(result[0].subtotal).toBe(340)
  })
})

// ---- Per-unit order price -------------------------------------------------

describe('per-unit order price for a discounted item', () => {
  it('matches the cart subtotal divided by quantity', () => {
    // Arrange
    const item = makeItem({ price: 200, discounted_price: 150 })
    const cartItem = makeCartItem(item, { 'type-size': large }, [oatMilk], 3)

    // Act — mirrors what checkout writes onto each order item
    const unitPrice = calculateCartItemUnitPrice(
      getEffectiveItemPrice(cartItem.menu_item),
      cartItem.selected_variations,
      cartItem.selected_addons
    )

    // Assert — server enforces subtotal = price × quantity
    expect(unitPrice).toBe(185)
    expect(unitPrice * cartItem.quantity).toBe(cartItem.subtotal)
  })
})
