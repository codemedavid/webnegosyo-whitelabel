import { describe, it, expect } from '@jest/globals'
import { backfillCustomers, type BackfillOrderRow } from '@/lib/customers-backfill'
import type {
  CustomerStore,
  CustomerProfilePatch,
  NewCustomerInput,
  CustomerOrderFacts,
} from '@/lib/customers-service'

/**
 * In-memory CustomerStore for exercising the backfill orchestration without a live
 * database. `seedFacts` stand in for rows already present in `orders` (backfill
 * reads history that already exists). The store knows each order's facts by id;
 * the backfill supplies only identity fields per order — exactly the split between
 * the DB rows and the resolver in production.
 */
interface SeedFacts extends CustomerOrderFacts {
  id: string
}
interface FakeOrder extends SeedFacts {
  customerId: string | null
}
interface StoredCustomer extends NewCustomerInput {
  profile: CustomerProfilePatch | null
}

function makeFakeStore(seedFacts: SeedFacts[]) {
  const customers = new Map<string, StoredCustomer>()
  const orders: FakeOrder[] = seedFacts.map((o) => ({ ...o, customerId: null }))
  let seq = 0

  const store: CustomerStore = {
    async findCustomerId(tenantId, phoneE164, email) {
      for (const [id, c] of customers) {
        if (c.tenantId !== tenantId) continue
        if (phoneE164 && c.phoneE164 === phoneE164) return id
        if (!phoneE164 && email && c.phoneE164 == null && c.email === email) return id
      }
      return null
    },
    async createCustomer(input: NewCustomerInput) {
      const id = `cust_${++seq}`
      customers.set(id, { ...input, profile: null })
      return id
    },
    async saveCustomerProfile(customerId, patch) {
      const existing = customers.get(customerId)
      if (existing) customers.set(customerId, { ...existing, profile: patch })
    },
    async linkOrderToCustomer(orderId, customerId) {
      const row = orders.find((o) => o.id === orderId)
      if (row && row.customerId == null) row.customerId = customerId
    },
    async listCustomerOrders(customerId) {
      return orders
        .filter((o) => o.customerId === customerId)
        .map(({ total, createdAt, channel, items, smsConsent }) => ({
          total,
          createdAt,
          channel,
          items,
          smsConsent,
        }))
    },
  }

  return { store, customers, orders }
}

const TWO_ORDERS_ONE_PHONE: SeedFacts[] = [
  { id: 'o1', total: 100, createdAt: '2026-01-01T10:00:00.000Z', channel: 'Pickup' },
  { id: 'o2', total: 300, createdAt: '2026-02-01T10:00:00.000Z', channel: 'Delivery' },
]
const ROWS_ONE_PHONE: BackfillOrderRow[] = [
  { id: 'o1', name: 'Ana', contact: '09171234567', customerData: null },
  { id: 'o2', name: 'Ana', contact: '+639171234567', customerData: null },
]

describe('backfillCustomers', () => {
  it('dry-runs by default — reports what it would do but writes nothing', async () => {
    const { store, customers, orders } = makeFakeStore(TWO_ORDERS_ONE_PHONE)

    const report = await backfillCustomers(store, 'tenant-1', ROWS_ONE_PHONE)

    expect(report.dryRun).toBe(true)
    expect(report.scanned).toBe(2)
    expect(report.identifiable).toBe(2)
    expect(report.skipped).toBe(0)
    // Both orders share one normalized phone → one distinct customer.
    expect(report.customersTouched).toBe(1)
    // Critical safety guarantee: a dry run touches no rows.
    expect(customers.size).toBe(0)
    expect(orders.every((o) => o.customerId === null)).toBe(true)
  })

  it('persists and dedupes profiles when executed', async () => {
    const { store, customers } = makeFakeStore(TWO_ORDERS_ONE_PHONE)

    const report = await backfillCustomers(store, 'tenant-1', ROWS_ONE_PHONE, { execute: true })

    expect(report.dryRun).toBe(false)
    expect(report.customersTouched).toBe(1)
    expect(customers.size).toBe(1)
    const profile = [...customers.values()][0].profile!
    expect(profile.orderCount).toBe(2)
    expect(profile.totalSpent).toBe(400)
  })

  it('is idempotent — re-running the backfill never double-counts', async () => {
    const { store, customers } = makeFakeStore(TWO_ORDERS_ONE_PHONE)

    await backfillCustomers(store, 'tenant-1', ROWS_ONE_PHONE, { execute: true })
    await backfillCustomers(store, 'tenant-1', ROWS_ONE_PHONE, { execute: true })

    expect(customers.size).toBe(1)
    const profile = [...customers.values()][0].profile!
    expect(profile.orderCount).toBe(2)
    expect(profile.totalSpent).toBe(400)
  })

  it('skips anonymous / walk-in orders and counts them separately', async () => {
    const { store, customers } = makeFakeStore([
      { id: 'o1', total: 90, createdAt: '2026-01-01T10:00:00.000Z', channel: 'Dine-in' },
      { id: 'o2', total: 120, createdAt: '2026-01-02T10:00:00.000Z', channel: 'Pickup' },
    ])
    const rows: BackfillOrderRow[] = [
      { id: 'o1', name: 'Walk-in', contact: 'walk-in', customerData: null },
      { id: 'o2', name: 'Bea', contact: '09181234567', customerData: null },
    ]

    const report = await backfillCustomers(store, 'tenant-1', rows, { execute: true })

    expect(report.scanned).toBe(2)
    expect(report.identifiable).toBe(1)
    expect(report.skipped).toBe(1)
    expect(report.customersTouched).toBe(1)
    expect(customers.size).toBe(1)
  })
})
