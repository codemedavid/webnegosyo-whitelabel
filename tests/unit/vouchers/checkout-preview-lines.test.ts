/**
 * The checkout voucher preview must price the SAME lines the server will.
 *
 * `createOrderAction` receives regular cart items plus every bundle slot
 * flattened by `flattenBundleOrderItems`, and re-prices the vouchers from that
 * whole set. The preview used to send only the regular items, so a cart holding
 * a bundle previewed a smaller discount than the customer was actually charged
 * — and the summary changed under them on "Order Placed!".
 */

import { buildVoucherPreviewLines } from '@/lib/vouchers/checkout-preview-lines'
import { flattenBundleOrderItems } from '@/lib/bundle-order-items'
import {
  createTestCartBundleItem,
  createTestSlotSelection,
} from '../../fixtures/bundle.fixture'
import { createTestMenuItem } from '../../fixtures/menu-item.fixture'
import type { CartItem } from '@/types/database'

function cartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'line-a',
    menu_item: createTestMenuItem({ id: 'item-1', category_id: 'cat-1', price: 100 }),
    selected_addons: [],
    quantity: 1,
    subtotal: 100,
    ...overrides,
  }
}

describe('buildVoucherPreviewLines', () => {
  it('prices regular cart items with their category', () => {
    // Arrange
    const items = [cartItem()]

    // Act
    const lines = buildVoucherPreviewLines(items, [])

    // Assert
    expect(lines).toEqual([
      { id: 'line-a', menuItemId: 'item-1', categoryId: 'cat-1', quantity: 1, subtotal: 100 },
    ])
  })

  it('includes bundle slots, which the server prices too', () => {
    // Arrange
    const bundle = createTestCartBundleItem({
      quantity: 2,
      slots: [createTestSlotSelection({ menuItemId: 'drink-1', priceOverride: 45, quantity: 1 })],
    })

    // Act
    const lines = buildVoucherPreviewLines([], [bundle])

    // Assert — one line per slot, priced exactly as the order flattening does
    const [flattened] = flattenBundleOrderItems([bundle])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      menuItemId: flattened.menu_item_id,
      quantity: flattened.quantity,
      subtotal: flattened.subtotal,
    })
  })

  it('totals the same as the order the server will price', () => {
    // Arrange — the divergence that made this a customer-visible bug
    const items = [cartItem({ subtotal: 100 })]
    const bundles = [
      createTestCartBundleItem({
        quantity: 1,
        slots: [createTestSlotSelection({ priceOverride: 250, quantity: 1 })],
      }),
    ]

    // Act
    const previewSubtotal = buildVoucherPreviewLines(items, bundles).reduce(
      (sum, line) => sum + line.subtotal,
      0,
    )
    const orderSubtotal =
      items.reduce((sum, item) => sum + item.subtotal, 0) +
      flattenBundleOrderItems(bundles).reduce((sum, line) => sum + line.subtotal, 0)

    // Assert
    expect(previewSubtotal).toBe(orderSubtotal)
  })

  it('gives every line a distinct id so per-line caps cannot collide', () => {
    // Arrange — two bundles of the same dish, plus a regular line
    const bundles = [
      createTestCartBundleItem({ id: 'cart-bundle-1', slots: [createTestSlotSelection()] }),
      createTestCartBundleItem({ id: 'cart-bundle-2', slots: [createTestSlotSelection()] }),
    ]

    // Act
    const lines = buildVoucherPreviewLines([cartItem()], bundles)

    // Assert
    expect(new Set(lines.map((line) => line.id)).size).toBe(lines.length)
  })

  it('leaves a bundle slot category null rather than guessing one', () => {
    // The cart never carries a slot's category. Claiming one here would let a
    // category-scoped voucher preview a discount the server does not grant;
    // the action fills these in from the database instead.
    const lines = buildVoucherPreviewLines([], [createTestCartBundleItem()])

    expect(lines[0].categoryId).toBeNull()
  })
})
