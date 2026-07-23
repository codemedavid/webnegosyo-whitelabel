import type { CartItem, MenuItem, Variation, VariationOption } from '@/types/database'
import {
  makeCartItem,
  replaceCartItem,
  MAX_CART_ITEM_QUANTITY,
  generateCartItemId,
} from '@/lib/cart-utils'

// ---- Fixtures -------------------------------------------------------------

const chocolate: VariationOption = {
  id: 'opt-choco',
  name: 'Chocolate',
  price_modifier: 0,
  display_order: 0,
}

const vanilla: VariationOption = {
  id: 'opt-vanilla',
  name: 'Vanilla',
  price_modifier: 0,
  display_order: 1,
}

const strawberry: VariationOption = {
  id: 'opt-strawberry',
  name: 'Strawberry',
  price_modifier: 10,
  display_order: 2,
}

/** A cake with a single "Flavor" variation group. */
function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-cake',
    tenant_id: 'tenant-1',
    category_id: 'cat-1',
    name: 'Signature Cake',
    description: 'A cake',
    price: 100,
    image_url: '',
    variation_types: [
      {
        id: 'type-flavor',
        name: 'Flavor',
        is_required: true,
        display_order: 0,
        options: [chocolate, vanilla, strawberry],
      },
    ],
    variations: [],
    addons: [],
    is_available: true,
    order: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const smallVar: Variation = { id: 'var-small', name: 'Small', price_modifier: 0 }
const largeVar: Variation = { id: 'var-large', name: 'Large', price_modifier: 20 }

/** A legacy item with flat size variations. */
function makeLegacyItem(): MenuItem {
  return makeMenuItem({
    id: 'item-legacy',
    variation_types: [],
    variations: [smallVar, largeVar],
  })
}

// ---- makeCartItem ---------------------------------------------------------

describe('makeCartItem', () => {
  it('builds a cart item with grouped-variation id and correct subtotal', () => {
    // Arrange
    const item = makeMenuItem()
    const selected = { 'type-flavor': chocolate }

    // Act
    const cartItem = makeCartItem(item, selected, [], 2)

    // Assert
    expect(cartItem.id).toBe(generateCartItemId('item-cake', selected, []))
    expect(cartItem.selected_variations).toEqual(selected)
    expect(cartItem.selected_variation).toBeUndefined()
    expect(cartItem.quantity).toBe(2)
    expect(cartItem.subtotal).toBe(200) // (100 + 0) * 2
  })

  it('builds a legacy-variation cart item with the legacy id shape', () => {
    // Arrange
    const item = makeLegacyItem()

    // Act
    const cartItem = makeCartItem(item, largeVar, [], 1)

    // Assert
    expect(cartItem.id).toBe(generateCartItemId('item-legacy', largeVar.id, []))
    expect(cartItem.selected_variation).toEqual(largeVar)
    expect(cartItem.selected_variations).toBeUndefined()
    expect(cartItem.subtotal).toBe(120) // 100 + 20
  })
})

// ---- replaceCartItem ------------------------------------------------------

describe('replaceCartItem', () => {
  it('changes one line item flavor without touching the sibling line (the reported bug)', () => {
    // Arrange: two lines of the same product, different flavor
    const item = makeMenuItem()
    const chocoLine = makeCartItem(item, { 'type-flavor': chocolate }, [], 1)
    const vanillaLine = makeCartItem(item, { 'type-flavor': vanilla }, [], 1)
    const items: CartItem[] = [chocoLine, vanillaLine]

    // Act: change the chocolate line to strawberry
    const edited = makeCartItem(item, { 'type-flavor': strawberry }, [], 1)
    const result = replaceCartItem(items, chocoLine.id, edited)

    // Assert: still two lines; sibling untouched; edited line updated in place
    expect(result).toHaveLength(2)
    expect(result[0].selected_variations).toEqual({ 'type-flavor': strawberry })
    expect(result[1]).toBe(vanillaLine) // vanilla line is the exact same reference
    expect(result[0].subtotal).toBe(110) // strawberry adds +10
  })

  it('does not mutate the original items array', () => {
    // Arrange
    const item = makeMenuItem()
    const chocoLine = makeCartItem(item, { 'type-flavor': chocolate }, [], 1)
    const items: CartItem[] = [chocoLine]
    const snapshot = JSON.parse(JSON.stringify(items))

    // Act
    const edited = makeCartItem(item, { 'type-flavor': vanilla }, [], 1)
    replaceCartItem(items, chocoLine.id, edited)

    // Assert
    expect(items).toEqual(snapshot)
  })

  it('merges quantities when the edit collides with another existing line', () => {
    // Arrange: choco x2 and vanilla x3
    const item = makeMenuItem()
    const chocoLine = makeCartItem(item, { 'type-flavor': chocolate }, [], 2)
    const vanillaLine = makeCartItem(item, { 'type-flavor': vanilla }, [], 3)
    const items: CartItem[] = [chocoLine, vanillaLine]

    // Act: change the choco line to vanilla -> should merge into the vanilla line
    const edited = makeCartItem(item, { 'type-flavor': vanilla }, [], 2)
    const result = replaceCartItem(items, chocoLine.id, edited)

    // Assert: one merged line, qty 5
    expect(result).toHaveLength(1)
    expect(result[0].selected_variations).toEqual({ 'type-flavor': vanilla })
    expect(result[0].quantity).toBe(5)
    expect(result[0].subtotal).toBe(500) // 100 * 5
  })

  it('clamps merged quantity to the maximum', () => {
    // Arrange
    const item = makeMenuItem()
    const chocoLine = makeCartItem(item, { 'type-flavor': chocolate }, [], 90)
    const vanillaLine = makeCartItem(item, { 'type-flavor': vanilla }, [], 90)
    const items: CartItem[] = [chocoLine, vanillaLine]

    // Act
    const edited = makeCartItem(item, { 'type-flavor': vanilla }, [], 90)
    const result = replaceCartItem(items, chocoLine.id, edited)

    // Assert
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(MAX_CART_ITEM_QUANTITY)
  })

  it('returns the array unchanged when the edited item id is not present', () => {
    // Arrange
    const item = makeMenuItem()
    const chocoLine = makeCartItem(item, { 'type-flavor': chocolate }, [], 1)
    const items: CartItem[] = [chocoLine]

    // Act
    const edited = makeCartItem(item, { 'type-flavor': vanilla }, [], 1)
    const result = replaceCartItem(items, 'nonexistent-id', edited)

    // Assert
    expect(result).toBe(items)
  })

  it('replaces in place preserving order for a multi-line cart', () => {
    // Arrange: three lines
    const item = makeMenuItem()
    const a = makeCartItem(item, { 'type-flavor': chocolate }, [], 1)
    const b = makeCartItem(item, { 'type-flavor': vanilla }, [], 1)
    const c = makeCartItem(item, { 'type-flavor': strawberry }, [], 1)
    const items: CartItem[] = [a, b, c]

    // Act: edit the middle line's quantity only (same flavor, new qty)
    const editedB = makeCartItem(item, { 'type-flavor': vanilla }, [], 4)
    const result = replaceCartItem(items, b.id, editedB)

    // Assert: order preserved, middle updated
    expect(result.map((i) => i.id)).toEqual([a.id, b.id, c.id])
    expect(result[1].quantity).toBe(4)
  })
})
