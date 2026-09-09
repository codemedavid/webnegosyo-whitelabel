import {
  computeCustomerOverview,
  isQualifiedOrderFact,
  rankCustomerItems,
  type CustomerOrderFact,
} from '@/lib/customer-order-facts'

const NOW = new Date('2026-09-04T12:00:00+08:00')

function fact(overrides: Partial<CustomerOrderFact> = {}): CustomerOrderFact {
  return {
    backend: 'platform_supabase',
    externalOrderId: crypto.randomUUID(),
    customerId: 'customer-a',
    phoneE164: '+639171234567',
    source: 'online',
    status: 'delivered',
    paymentStatus: 'paid',
    branchId: null,
    netTotal: 250,
    orderedAt: '2026-09-01T02:00:00.000Z',
    completedAt: '2026-09-01T03:00:00.000Z',
    updatedAt: '2026-09-01T03:00:00.000Z',
    items: [],
    ...overrides,
  }
}

describe('customer order facts', () => {
  it('qualifies POS only after settlement and online orders only after fulfilment', () => {
    expect(isQualifiedOrderFact(fact({ source: 'pos', status: 'confirmed', paymentStatus: 'paid' }))).toBe(true)
    expect(isQualifiedOrderFact(fact({ source: 'pos', status: 'confirmed', paymentStatus: 'pending' }))).toBe(false)
    expect(isQualifiedOrderFact(fact({ source: 'online', status: 'ready', paymentStatus: 'paid' }))).toBe(false)
    expect(isQualifiedOrderFact(fact({ source: 'online', status: 'collected', paymentStatus: 'paid' }))).toBe(true)
    expect(isQualifiedOrderFact(fact({ source: 'online', status: 'cancelled', paymentStatus: 'paid' }))).toBe(false)
  })

  it('defines repeat rate using an earlier qualified order and reports identity coverage', () => {
    const result = computeCustomerOverview([
      fact({ externalOrderId: 'old-a', customerId: 'a', orderedAt: '2026-08-01T00:00:00Z', completedAt: '2026-08-01T01:00:00Z' }),
      fact({ externalOrderId: 'period-a', customerId: 'a' }),
      fact({ externalOrderId: 'period-b', customerId: 'b', phoneE164: '+639181234567' }),
      fact({ externalOrderId: 'anonymous', customerId: null, phoneE164: null }),
      fact({ externalOrderId: 'unqualified', customerId: 'c', phoneE164: '+639191234567', status: 'pending' }),
    ], { days: 7, now: NOW })

    expect(result.identifiedCustomers).toBe(2)
    expect(result.returningCustomers).toBe(1)
    expect(result.newCustomers).toBe(1)
    expect(result.repeatRate).toBe(50)
    expect(result.identifiedOrderCoverage).toBe(66.67)
  })

  it('ranks completed units by stable item id and normalized legacy name', () => {
    const ranked = rankCustomerItems([
      fact({ items: [{ menuItemId: 'menu-1', name: 'Iced Latte', quantity: 2 }] }),
      fact({ externalOrderId: 'two', items: [{ menuItemId: 'menu-1', name: 'Iced Latte (old label)', quantity: 1 }] }),
      fact({ externalOrderId: 'three', items: [{ menuItemId: null, name: '  Banana   Bread ', quantity: 2 }] }),
      fact({ externalOrderId: 'four', items: [{ name: 'banana bread', quantity: 3 }] }),
      fact({ externalOrderId: 'cancelled', status: 'cancelled', items: [{ name: 'Banana Bread', quantity: 99 }] }),
    ])

    expect(ranked).toEqual([
      { key: 'name:banana bread', menuItemId: null, name: 'Banana Bread', quantity: 5 },
      { key: 'id:menu-1', menuItemId: 'menu-1', name: 'Iced Latte', quantity: 3 },
    ])
  })
})
