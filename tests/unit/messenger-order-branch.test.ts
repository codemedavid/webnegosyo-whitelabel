import { describe, it, expect } from '@jest/globals'
import { formatOrderMessage } from '@/lib/messenger-message-formatter'
import type { Order, Tenant } from '@/types/database'

/**
 * The branch on the Messenger ticket.
 *
 * Messenger is where most merchants actually read their orders — the admin
 * dashboard is the second place they look, not the first. A branch shown in the
 * dashboard but missing from the Messenger message means the person cooking the
 * food never learns which kitchen the order was for.
 *
 * A tenant without branches must get a byte-for-byte identical message, since
 * this text is what every existing merchant already reads.
 */

const TENANT = { name: 'Lucky Joy' } as Tenant

function orderWith(customerData: Record<string, unknown> | null): Order {
  return {
    id: 'order-1',
    order_type: 'Pick Up',
    customer_name: 'Ana',
    customer_contact: '09171234567',
    customer_data: customerData,
    total_amount: 250,
  } as unknown as Order
}

describe('formatOrderMessage — branch', () => {
  it('names the branch that took the order', () => {
    const message = formatOrderMessage(
      orderWith({ outlet_id: 'outlet-bgc', outlet_name: 'Lucky Joy — BGC' }),
      TENANT
    )
    expect(message).toContain('Lucky Joy — BGC')
  })

  it('labels the branch line so it is not mistaken for the store name', () => {
    const message = formatOrderMessage(
      orderWith({ outlet_id: 'outlet-bgc', outlet_name: 'Lucky Joy — BGC' }),
      TENANT
    )
    expect(message).toMatch(/Branch:.*Lucky Joy — BGC/)
  })

  it('adds nothing for a single-location tenant', () => {
    const withBranch = formatOrderMessage(orderWith({ customer_phone: '09171234567' }), TENANT)
    expect(withBranch).not.toContain('Branch')
  })

  it('adds nothing when the order has no customer_data at all', () => {
    expect(formatOrderMessage(orderWith(null), TENANT)).not.toContain('Branch')
  })

  it('never leaks the raw carrier id into the message', () => {
    const message = formatOrderMessage(
      orderWith({ outlet_id: 'outlet-bgc', outlet_name: 'Lucky Joy — BGC' }),
      TENANT
    )
    expect(message).not.toContain('outlet-bgc')
  })

  it('adds nothing when only an id was recorded', () => {
    // No name means nothing worth showing a cook.
    expect(formatOrderMessage(orderWith({ outlet_id: 'outlet-bgc' }), TENANT)).not.toContain('Branch')
  })

  it('leaves a single-location message otherwise unchanged', () => {
    const plain = orderWith({ delivery_address: '123 Main St' })
    const message = formatOrderMessage(plain, TENANT)
    expect(message).toContain('New Order from Lucky Joy')
    expect(message).toContain('123 Main St')
    expect(message).not.toContain('Branch')
  })
})
