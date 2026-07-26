import { describe, it, expect } from '@jest/globals'
import { computeCustomerInsights } from '@/lib/customer-insights'
import type { Customer } from '@/types/database'

/** Minimal customer row builder — only the fields the insights actually read. */
function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust-1',
    tenant_id: 'tenant-1',
    phone_e164: '+639171234567',
    email: null,
    name: 'Ana',
    first_order_at: '2026-01-01T00:00:00.000Z',
    last_order_at: '2026-03-01T00:00:00.000Z',
    order_count: 5,
    total_spent: 2500,
    average_order_value: 500,
    channels_used: ['pickup'],
    top_items: [
      { name: 'Latte', quantity: 9 },
      { name: 'Croissant', quantity: 4 },
    ],
    sms_consent: false,
    sms_consent_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    ...overrides,
  } as Customer
}

const NOW = new Date('2026-03-08T00:00:00.000Z')

describe('computeCustomerInsights — favorite item', () => {
  it('returns the highest-quantity item as the favorite', () => {
    const insights = computeCustomerInsights(makeCustomer(), NOW)

    expect(insights.favoriteItem).toEqual({ name: 'Latte', quantity: 9 })
  })

  it('returns null when the customer has no recorded items', () => {
    const insights = computeCustomerInsights(makeCustomer({ top_items: [] }), NOW)

    expect(insights.favoriteItem).toBeNull()
  })

  it('ignores stored ordering and picks the true maximum', () => {
    const insights = computeCustomerInsights(
      makeCustomer({
        top_items: [
          { name: 'Croissant', quantity: 2 },
          { name: 'Cold Brew', quantity: 11 },
        ],
      }),
      NOW
    )

    expect(insights.favoriteItem).toEqual({ name: 'Cold Brew', quantity: 11 })
  })
})

describe('computeCustomerInsights — frequency', () => {
  it('averages the gap between orders across the customer lifespan', () => {
    // 5 orders spanning 2026-01-01 -> 2026-03-01 (59 days) = 4 gaps ≈ 14.75 days
    const insights = computeCustomerInsights(makeCustomer(), NOW)

    expect(insights.daysBetweenOrders).toBeCloseTo(14.8, 1)
    expect(insights.ordersPerMonth).toBeCloseTo(2.06, 1)
  })

  it('reports a first-time customer instead of a cadence', () => {
    const insights = computeCustomerInsights(
      makeCustomer({
        order_count: 1,
        first_order_at: '2026-03-01T00:00:00.000Z',
        last_order_at: '2026-03-01T00:00:00.000Z',
      }),
      NOW
    )

    expect(insights.daysBetweenOrders).toBeNull()
    expect(insights.ordersPerMonth).toBe(0)
    expect(insights.frequencyLabel).toBe('First-time')
  })

  it('labels a repeat customer whose orders all landed on the same day', () => {
    const insights = computeCustomerInsights(
      makeCustomer({
        order_count: 3,
        first_order_at: '2026-03-01T00:00:00.000Z',
        last_order_at: '2026-03-01T00:00:00.000Z',
      }),
      NOW
    )

    expect(insights.daysBetweenOrders).toBeNull()
    expect(insights.frequencyLabel).toBe('Repeat')
  })

  it('describes a regular cadence in days', () => {
    const insights = computeCustomerInsights(makeCustomer(), NOW)

    expect(insights.frequencyLabel).toBe('Every ~15 days')
  })

  it('handles a customer with no order dates at all', () => {
    const insights = computeCustomerInsights(
      makeCustomer({ order_count: 0, first_order_at: null, last_order_at: null, total_spent: 0 }),
      NOW
    )

    expect(insights.daysBetweenOrders).toBeNull()
    expect(insights.daysSinceLastOrder).toBeNull()
    expect(insights.frequencyLabel).toBe('First-time')
  })
})

describe('computeCustomerInsights — lifetime value', () => {
  it('reports actual spend as the lifetime value', () => {
    const insights = computeCustomerInsights(makeCustomer(), NOW)

    expect(insights.lifetimeValue).toBe(2500)
  })

  it('projects a 12-month value from cadence and average order value', () => {
    // 2.06 orders/mo × ₱500 × 12 months ≈ ₱12,375
    const insights = computeCustomerInsights(makeCustomer(), NOW)

    expect(insights.projectedLtv).toBeGreaterThan(12000)
    expect(insights.projectedLtv).toBeLessThan(12800)
  })

  it('falls back to actual spend when no cadence can be derived', () => {
    const insights = computeCustomerInsights(
      makeCustomer({
        order_count: 1,
        total_spent: 300,
        average_order_value: 300,
        first_order_at: '2026-03-01T00:00:00.000Z',
        last_order_at: '2026-03-01T00:00:00.000Z',
      }),
      NOW
    )

    expect(insights.projectedLtv).toBe(300)
  })

  it('coerces string numerics from Postgres numeric columns', () => {
    const insights = computeCustomerInsights(
      makeCustomer({
        total_spent: '2500.00' as unknown as number,
        average_order_value: '500.00' as unknown as number,
      }),
      NOW
    )

    expect(insights.lifetimeValue).toBe(2500)
    expect(insights.projectedLtv).toBeGreaterThan(12000)
  })
})

describe('computeCustomerInsights — engagement status', () => {
  it('marks a single-order customer as new', () => {
    const insights = computeCustomerInsights(
      makeCustomer({
        order_count: 1,
        first_order_at: '2026-03-05T00:00:00.000Z',
        last_order_at: '2026-03-05T00:00:00.000Z',
      }),
      NOW
    )

    expect(insights.status).toBe('new')
  })

  it('marks a customer ordering within their usual cadence as active', () => {
    // cadence ≈ 14.8 days, last order 7 days ago
    const insights = computeCustomerInsights(makeCustomer(), NOW)

    expect(insights.daysSinceLastOrder).toBe(7)
    expect(insights.status).toBe('active')
  })

  it('marks a customer overdue past their cadence as at risk', () => {
    // cadence ≈ 14.8 days; 31 days of silence is overdue but not yet abandoned.
    const insights = computeCustomerInsights(makeCustomer(), new Date('2026-04-01T00:00:00.000Z'))

    expect(insights.daysSinceLastOrder).toBe(31)
    expect(insights.status).toBe('at_risk')
  })

  it('marks a long-silent customer as lapsed', () => {
    // cadence ≈ 14.8 days; 92 days of silence is more than 3 missed cycles.
    const insights = computeCustomerInsights(makeCustomer(), new Date('2026-06-01T00:00:00.000Z'))

    expect(insights.status).toBe('lapsed')
  })
})
