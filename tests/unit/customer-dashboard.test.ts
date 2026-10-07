/**
 * The merchant app's Reports dashboard: revenue told through the people who
 * paid it. Every number the app draws is computed here (the app cannot import
 * `src/`), so these tests pin the definitions the merchant reads as facts.
 */
import {
  attachCustomerNames,
  buildCustomerDashboard,
  isCustomerHubOn,
} from '@/lib/customer-dashboard'
import type { CustomerOrderFact } from '@/lib/customer-order-facts'

const NOW = new Date('2026-09-30T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString()
}

let sequence = 0
function fact(overrides: Partial<CustomerOrderFact> & { at?: number } = {}): CustomerOrderFact {
  const { at = 1, ...rest } = overrides
  sequence += 1
  return {
    backend: 'platform_supabase',
    externalOrderId: `order-${sequence}`,
    customerId: null,
    phoneE164: null,
    source: 'online',
    status: 'delivered',
    paymentStatus: 'paid',
    branchId: null,
    netTotal: 100,
    orderedAt: daysAgo(at),
    completedAt: daysAgo(at),
    updatedAt: daysAgo(at),
    items: [{ menuItemId: 'latte', name: 'Latte', quantity: 1 }],
    ...rest,
  }
}

function windowOf(facts: CustomerOrderFact[], days: 7 | 30 | 90 = 30) {
  const dashboard = buildCustomerDashboard(facts, { now: NOW, tillComplete: true })
  const found = dashboard.windows.find((window) => window.days === days)
  if (!found) throw new Error(`no ${days}-day window`)
  return found
}

describe('buildCustomerDashboard — revenue split', () => {
  it('splits revenue into repeat orders, first orders and unnamed orders', () => {
    const facts = [
      // Ana was here before the window, so her order in it is a regular's.
      fact({ customerId: 'ana', at: 60, netTotal: 500 }),
      fact({ customerId: 'ana', at: 3, netTotal: 300 }),
      // Ben's first ever order is first-timer money; his second, a week later, is a regular's.
      fact({ customerId: 'ben', at: 10, netTotal: 200 }),
      fact({ customerId: 'ben', at: 2, netTotal: 150 }),
      // A walk-in nobody named.
      fact({ at: 5, netTotal: 80 }),
    ]

    const window = windowOf(facts)

    expect(window.revenue).toEqual({ total: 730, returning: 450, new: 200, unknown: 80 })
    expect(window.orders).toBe(4)
    expect(window.knownOrders).toBe(3)
  })

  it('never counts a cancelled or unpaid order as money', () => {
    const facts = [
      fact({ customerId: 'ana', at: 3, netTotal: 300, status: 'cancelled' }),
      fact({ at: 3, netTotal: 90, source: 'pos', status: 'completed', paymentStatus: 'pending' }),
      fact({ at: 3, netTotal: 40 }),
    ]

    expect(windowOf(facts).revenue.total).toBe(40)
  })

  it('compares against the window before it', () => {
    const facts = [
      fact({ customerId: 'ana', at: 40, netTotal: 100 }),
      fact({ at: 45, netTotal: 100 }),
      fact({ customerId: 'ana', at: 5, netTotal: 300 }),
    ]

    const window = windowOf(facts)

    expect(window.previousRevenue).toBe(200)
    expect(window.previousOrders).toBe(2)
    expect(window.previousCustomers).toBe(1)
    expect(window.previousRepeatRate).toBe(0)
  })
})

describe('buildCustomerDashboard — who is buying', () => {
  it('counts named customers and how many came back', () => {
    const facts = [
      fact({ customerId: 'ana', at: 60 }),
      fact({ customerId: 'ana', at: 3 }),
      fact({ phoneE164: '+639170000001', at: 4 }),
      fact({ at: 4 }),
    ]

    const window = windowOf(facts)

    expect(window.customers).toBe(2)
    expect(window.returningCustomers).toBe(1)
    expect(window.newCustomers).toBe(1)
    expect(window.repeatRate).toBe(50)
  })

  it('counts a guest who started inside the window and came back as a returning guest', () => {
    // A store whose named history is a few weeks old still has regulars: a
    // guest on their sixth visit this month is one, whenever their first was.
    const facts = [
      fact({ customerId: 'ana', at: 20 }),
      fact({ customerId: 'ana', at: 12 }),
      fact({ customerId: 'ana', at: 4 }),
    ]

    const window = windowOf(facts)

    expect(window.returningCustomers).toBe(1)
    expect(window.newCustomers).toBe(1)
    expect(window.repeatRate).toBe(100)
  })

  it('counts guests who came exactly once in the window and never since', () => {
    const facts = [
      fact({ customerId: 'once', at: 12 }),
      fact({ customerId: 'twice', at: 12 }),
      fact({ customerId: 'twice', at: 2 }),
      fact({ customerId: 'old-regular', at: 70 }),
      fact({ customerId: 'old-regular', at: 4 }),
    ]

    expect(windowOf(facts).oneTimers).toBe(1)
  })

  it("files a guest's second order under regulars' favourites, and their first under first-timers'", () => {
    const facts = [
      fact({ customerId: 'ben', at: 9, items: [{ menuItemId: 'halo', name: 'Halo-halo', quantity: 1 }] }),
      fact({ customerId: 'ben', at: 2, items: [{ menuItemId: 'sisig', name: 'Sisig', quantity: 1 }] }),
    ]

    const window = windowOf(facts)

    expect(window.favourites.new.map((item) => item.name)).toEqual(['Halo-halo'])
    expect(window.favourites.returning.map((item) => item.name)).toEqual(['Sisig'])
  })

  it('ranks favourites separately for regulars and first-timers', () => {
    const facts = [
      fact({ customerId: 'ana', at: 50 }),
      fact({ customerId: 'ana', at: 3, items: [{ menuItemId: 'sisig', name: 'Sisig', quantity: 4 }] }),
      fact({ customerId: 'ben', at: 3, items: [{ menuItemId: 'halo', name: 'Halo-halo', quantity: 2 }] }),
      // A walk-in's order belongs to neither list.
      fact({ at: 3, items: [{ menuItemId: 'water', name: 'Water', quantity: 9 }] }),
    ]

    const window = windowOf(facts)

    expect(window.favourites.returning.map((item) => item.name)).toEqual(['Sisig'])
    expect(window.favourites.new.map((item) => item.name)).toEqual(['Halo-halo'])
  })

  it('lists the best customers of the window by spend', () => {
    const facts = [
      fact({ customerId: 'ana', at: 3, netTotal: 300 }),
      fact({ customerId: 'ana', at: 1, netTotal: 200 }),
      fact({ phoneE164: '+639170001234', at: 2, netTotal: 900 }),
      fact({ at: 2, netTotal: 5000 }),
    ]

    const top = windowOf(facts).topCustomers

    expect(top).toEqual([
      expect.objectContaining({ customerId: null, phoneTail: '1234', visits: 1, spend: 900 }),
      expect.objectContaining({ customerId: 'ana', visits: 2, spend: 500, lastVisitAt: daysAgo(1) }),
    ])
  })
})

describe('buildCustomerDashboard — bring them back', () => {
  it('separates guests who are slipping from guests who are gone', () => {
    const facts = [
      // Weekly regular, quiet for 14 days: slipping (2× their rhythm).
      fact({ customerId: 'slipping', at: 28 }),
      fact({ customerId: 'slipping', at: 21 }),
      fact({ customerId: 'slipping', at: 14 }),
      // Weekly regular, quiet for 40 days: gone quiet (over 3× their rhythm).
      fact({ customerId: 'lapsed', at: 54 }),
      fact({ customerId: 'lapsed', at: 47 }),
      fact({ customerId: 'lapsed', at: 40 }),
      // Quiet for a year: too long gone to count as winnable.
      fact({ customerId: 'ancient', at: 400 }),
      fact({ customerId: 'ancient', at: 393 }),
      // Still on rhythm.
      fact({ customerId: 'steady', at: 8 }),
      fact({ customerId: 'steady', at: 1 }),
    ]

    const dashboard = buildCustomerDashboard(facts, { now: NOW, tillComplete: true })

    expect(dashboard.slipping).toBe(1)
    expect(dashboard.lapsed).toBe(1)
  })

  it('states what a regular is worth against a one-time guest', () => {
    const facts = [
      fact({ customerId: 'ana', at: 50, netTotal: 400 }),
      fact({ customerId: 'ana', at: 10, netTotal: 600 }),
      fact({ customerId: 'ben', at: 10, netTotal: 200 }),
      fact({ customerId: 'cy', at: 10, netTotal: 100 }),
    ]

    const dashboard = buildCustomerDashboard(facts, { now: NOW, tillComplete: true })

    expect(dashboard.lifetimeValue).toEqual({ regular: 1000, oneTime: 150 })
  })

  it('says nothing about lifetime value when nobody qualifies', () => {
    const dashboard = buildCustomerDashboard([], { now: NOW, tillComplete: false })

    expect(dashboard.lifetimeValue).toEqual({ regular: null, oneTime: null })
    expect(dashboard.tillComplete).toBe(false)
    expect(dashboard.windows.map((window) => window.days)).toEqual([7, 30, 90])
  })
})

describe('attachCustomerNames', () => {
  it('names the best customers it can, and leaves the rest to their number', () => {
    const dashboard = buildCustomerDashboard(
      [
        fact({ customerId: 'ana', at: 2, netTotal: 300 }),
        fact({ phoneE164: '+639170001234', at: 2, netTotal: 200 }),
      ],
      { now: NOW, tillComplete: true },
    )

    const named = attachCustomerNames(dashboard, new Map([['ana', 'Ana Reyes']]))
    const top = named.windows.find((window) => window.days === 30)?.topCustomers ?? []

    expect(top.map((customer) => customer.name)).toEqual(['Ana Reyes', null])
    // The input is not edited in place.
    expect(dashboard.windows[1].topCustomers[0].name).toBeNull()
  })
})

describe('isCustomerHubOn', () => {
  it('is on for every platform store, whatever the flag says', () => {
    expect(isCustomerHubOn({ customer_hub_enabled: false, order_backend: 'platform' })).toBe(true)
  })

  it('is on only with the flag for a store whose orders live elsewhere', () => {
    expect(isCustomerHubOn({ customer_hub_enabled: false, order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' })).toBe(false)
    expect(isCustomerHubOn({ customer_hub_enabled: true, order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' })).toBe(true)
  })
})
