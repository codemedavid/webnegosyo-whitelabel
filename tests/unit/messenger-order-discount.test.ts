import { describe, it, expect } from '@jest/globals'
import { formatOrderMessage } from '@/lib/messenger-message-formatter'
import type { Order, Tenant } from '@/types/database'

/**
 * The money rows on the Messenger ticket.
 *
 * Messenger is where most merchants actually read their orders, so a ticket
 * whose rows do not add up is the version of the truth they work from. The
 * subtotal used to be derived as `total - delivery_fee`, and `order.total` is
 * stored NET of any discount — so a discounted order printed item lines summing
 * to one number, a "Subtotal" showing a smaller one, and no row anywhere naming
 * the voucher that explains the gap.
 *
 * A ticket for an order with no discount must stay byte-for-byte what every
 * existing merchant already reads.
 */

const TENANT = { name: 'Lucky Joy' } as Tenant

const ITEMS = [
  { menu_item_name: 'Adobo', quantity: 1, subtotal: 150 },
  { menu_item_name: 'Rice', quantity: 2, subtotal: 50 },
]

function orderWith(overrides: Record<string, unknown>): Order {
  return {
    id: 'order-1',
    order_type: 'Delivery',
    status: 'pending',
    items: ITEMS,
    ...overrides,
  } as unknown as Order
}

describe('formatOrderMessage — discounted totals', () => {
  // ₱200 of items, a ₱20 voucher, ₱50 delivery — billed ₱230.
  const DISCOUNTED = orderWith({
    total: 230,
    delivery_fee: 50,
    discount_data: {
      total: 20,
      lines: [{ label: 'WELCOME10', amount: 20 }],
    },
  })

  it('states a subtotal that matches the items listed above it', () => {
    const message = formatOrderMessage(DISCOUNTED, TENANT)
    // The items sum to ₱200. The old derivation printed ₱180.
    expect(message).toContain('Subtotal: ₱200.00')
    expect(message).not.toContain('Subtotal: ₱180.00')
  })

  it('names the voucher that came off the bill', () => {
    const message = formatOrderMessage(DISCOUNTED, TENANT)
    expect(message).toContain('WELCOME10')
    expect(message).toMatch(/WELCOME10.*₱20\.00/)
  })

  it('prints rows the merchant can reconcile to the total charged', () => {
    const message = formatOrderMessage(DISCOUNTED, TENANT)
    // 200 − 20 + 50 = 230, and every one of those numbers is on the ticket.
    expect(message).toContain('₱200.00')
    expect(message).toContain('₱20.00')
    expect(message).toContain('Delivery Fee: ₱50.00')
    expect(message).toContain('Total: ₱230.00')
  })

  it('leaves an undiscounted delivery order reading exactly as before', () => {
    const message = formatOrderMessage(
      orderWith({ total: 250, delivery_fee: 50 }),
      TENANT
    )
    expect(message).toContain('Subtotal: ₱200.00')
    expect(message).toContain('Delivery Fee: ₱50.00')
    expect(message).toContain('Total: ₱250.00')
    expect(message).not.toContain('Discount')
  })

  it('shows no subtotal row at all when there is nothing between items and total', () => {
    // Repeating a sum already on the ticket adds a line the merchant has to
    // read past for no information.
    const message = formatOrderMessage(orderWith({ total: 200 }), TENANT)
    expect(message).not.toContain('Subtotal')
    expect(message).toContain('Total: ₱200.00')
  })

  it('reads a discount stored in customer_data by a Convex tenant', () => {
    const message = formatOrderMessage(
      orderWith({
        total: 180,
        customer_data: { discount: { total: 20, lines: [{ label: 'SAVE20', amount: 20 }] } },
      }),
      TENANT
    )
    expect(message).toContain('SAVE20')
    expect(message).toContain('Subtotal: ₱200.00')
    expect(message).toContain('Total: ₱180.00')
  })
})
