/**
 * Assembling the Customer Hub's overview payload.
 *
 * The Hub is rendered by the merchant app, which cannot import `src/`, so this
 * is the seam: the platform computes, the app renders numbers. Keeping the
 * arithmetic on this side means the repeat-rate definition cannot drift between
 * the app and the web admin port that follows.
 */
import { buildCustomerHubOverview } from '@/lib/customer-hub-overview'
import type { CustomerOrderFact } from '@/lib/customer-order-facts'

const NOW = new Date('2026-09-04T12:00:00.000Z')

function fact(overrides: Partial<CustomerOrderFact> = {}): CustomerOrderFact {
  return {
    backend: 'platform_supabase',
    externalOrderId: 'order-1',
    customerId: 'customer-a',
    phoneE164: null,
    source: 'online',
    status: 'delivered',
    paymentStatus: 'paid',
    branchId: null,
    netTotal: 250,
    orderedAt: '2026-09-01T02:00:00.000Z',
    completedAt: '2026-09-01T03:00:00.000Z',
    updatedAt: '2026-09-01T03:00:00.000Z',
    items: [{ menuItemId: 'menu-1', name: 'Latte', quantity: 2 }],
    ...overrides,
  }
}

describe('buildCustomerHubOverview', () => {
  it('reports all three windows from one read of the facts', () => {
    const result = buildCustomerHubOverview(
      { facts: [fact()], coverage: { complete: true } },
      { now: NOW },
    )

    expect(result.windows.map((window) => window.days)).toEqual([7, 30, 90])
  })

  it('ranks the top items across the widest window', () => {
    const result = buildCustomerHubOverview(
      {
        facts: [
          fact({ externalOrderId: 'a', items: [{ menuItemId: 'menu-1', name: 'Latte', quantity: 2 }] }),
          fact({ externalOrderId: 'b', items: [{ menuItemId: 'menu-2', name: 'Pandesal', quantity: 9 }] }),
        ],
        coverage: { complete: true },
      },
      { now: NOW },
    )

    expect(result.topItems[0]).toMatchObject({ menuItemId: 'menu-2', quantity: 9 })
  })

  it('passes the reader coverage straight through, so a thin ledger is visible', () => {
    const result = buildCustomerHubOverview(
      { facts: [], coverage: { complete: false, note: 'Ledger could not be reached.' } },
      { now: NOW },
    )

    expect(result.coverage).toEqual({ complete: false, note: 'Ledger could not be reached.' })
  })

  it('excludes unqualified orders from the item ranking, not just from the counts', () => {
    const result = buildCustomerHubOverview(
      {
        facts: [fact({ status: 'cancelled', items: [{ menuItemId: 'menu-9', name: 'Void', quantity: 5 }] })],
        coverage: { complete: true },
      },
      { now: NOW },
    )

    expect(result.topItems).toEqual([])
  })
})
