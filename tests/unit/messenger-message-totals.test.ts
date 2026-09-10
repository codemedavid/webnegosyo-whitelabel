/**
 * The number the merchant reads in Messenger has to be the number the customer
 * was charged.
 *
 * `generateMessengerMessage` used to re-add the bill itself — item subtotals
 * plus the service charge, full stop. A delivery fee, a voucher, and every
 * bundle in the cart were all missing from it, so a delivery order with a
 * voucher reached the merchant's inbox with a total that matched nothing: not
 * the checkout screen, not the orders list, not the receipt.
 */

import { describe, it, expect } from '@jest/globals'
import { generateMessengerMessage, formatPrice } from '@/lib/cart-utils'
import { computeOrderTotals, type OrderDiscountLine } from '@/lib/order-totals'
import type { CartItem, CartBundleItem } from '@/types/database'

const ITEM_SUBTOTAL = 300
const BUNDLE_SUBTOTAL = 250
const DELIVERY_FEE = 60
const SERVICE_CHARGE = 25
const DISCOUNTS: OrderDiscountLine[] = [{ label: 'WELCOME10', amount: 50, code: 'WELCOME10' }]

const ITEMS = [
  {
    id: 'ci-1',
    menu_item: { id: 'mi-1', name: 'Adobo' },
    quantity: 2,
    subtotal: ITEM_SUBTOTAL,
    selected_addons: [],
  },
] as unknown as CartItem[]

const BUNDLE_ITEMS = [
  {
    id: 'cb-1',
    bundleId: 'b-1',
    bundleName: 'Family Feast',
    slots: [],
    quantity: 1,
    pricingType: 'fixed',
    basePrice: BUNDLE_SUBTOTAL,
    subtotal: BUNDLE_SUBTOTAL,
  },
] as unknown as CartBundleItem[]

function totalLineOf(message: string): string | undefined {
  return message.split('\n').find(line => line.startsWith('💰 Total:'))
}

describe('generateMessengerMessage — grand total', () => {
  it('carries the delivery fee, the discount, and bundle pricing', () => {
    // Arrange
    const expected = computeOrderTotals({
      subtotal: ITEM_SUBTOTAL + BUNDLE_SUBTOTAL,
      deliveryFee: DELIVERY_FEE,
      serviceCharge: SERVICE_CHARGE,
      discounts: DISCOUNTS,
    })

    // Act
    const message = generateMessengerMessage(
      ITEMS,
      'Lucky Joy',
      { name: 'Delivery', type: 'delivery' },
      undefined,
      null,
      undefined,
      SERVICE_CHARGE,
      undefined,
      { bundleItems: BUNDLE_ITEMS, deliveryFee: DELIVERY_FEE, discounts: DISCOUNTS },
    )

    // Assert
    expect(expected.grandTotal).toBe(585)
    expect(totalLineOf(message)).toBe(`💰 Total: ${formatPrice(expected.grandTotal)}`)
  })

  it('names the bundle, the delivery fee, and the discount as their own lines', () => {
    // Act
    const message = generateMessengerMessage(
      ITEMS,
      'Lucky Joy',
      { name: 'Delivery', type: 'delivery' },
      undefined,
      null,
      undefined,
      SERVICE_CHARGE,
      undefined,
      { bundleItems: BUNDLE_ITEMS, deliveryFee: DELIVERY_FEE, discounts: DISCOUNTS },
    )

    // Assert
    expect(message).toContain('Family Feast')
    expect(message).toContain(`🚚 Delivery Fee: ${formatPrice(DELIVERY_FEE)}`)
    expect(message).toContain(`🎟️ WELCOME10: -${formatPrice(50)}`)
  })

  it('is unchanged for a cart with no fee, no discount, and no bundles', () => {
    // Act
    const message = generateMessengerMessage(ITEMS, 'Lucky Joy', null, undefined, null, undefined, SERVICE_CHARGE)

    // Assert
    expect(totalLineOf(message)).toBe(`💰 Total: ${formatPrice(ITEM_SUBTOTAL + SERVICE_CHARGE)}`)
    expect(message).not.toContain('Delivery Fee')
  })
})
