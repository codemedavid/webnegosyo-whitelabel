import { formatOrderMessage } from '@/lib/messenger-message-formatter'
import type { Order, Tenant } from '@/types/database'

const tenant = { name: 'Cafe X' } as Tenant

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: '12ab34cd-5678-90ef-1234-567890abcdef',
    tenant_id: 't1',
    items: [],
    total: 100,
    status: 'pending',
    created_at: '2026-07-16T00:00:00Z',
    updated_at: '2026-07-16T00:00:00Z',
    ...overrides,
  } as Order
}

describe('formatOrderMessage — daily order number header', () => {
  it('includes the daily number when present', () => {
    const msg = formatOrderMessage(makeOrder({ daily_number: 5 }), tenant)
    expect(msg).toContain('Order #05')
  })

  it('falls back to the UUID slice when no daily number exists', () => {
    const msg = formatOrderMessage(makeOrder({ daily_number: null }), tenant)
    expect(msg).toContain('Order #12AB34CD')
  })

  it('keeps the storefront greeting as the first line', () => {
    const msg = formatOrderMessage(makeOrder({ daily_number: 5 }), tenant)
    expect(msg.split('\n')[0]).toBe('🍽️ New Order from Cafe X')
  })
})
