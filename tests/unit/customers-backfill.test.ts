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

  /*
   * The shape that actually went missing in production: orders bulk-imported
   * from a store's old Convex deployment were inserted straight into `orders`,
   * so the checkout-time capture never ran. Most were dine-in, with the phone
   * only under the merchant's own field name and a blank contact column.
   */
  it('links an imported dine-in order whose phone sits only under a merchant-named field', async () => {
    const { store, customers, orders } = makeFakeStore([
      { id: 'imp1', total: 450, createdAt: '2026-09-10T10:00:00.000Z', channel: 'Dine In' },
    ])
    const rows: BackfillOrderRow[] = [
      {
        id: 'imp1',
        name: 'Cara',
        contact: '',
        customerData: { 'Phone number': '0917 765 4321', table_number: '7', convex_order_id: 'k1' },
        customerId: null,
        status: 'delivered',
      },
    ]

    const report = await backfillCustomers(store, 'tenant-1', rows, { execute: true })

    expect(report.identifiable).toBe(1)
    expect(customers.size).toBe(1)
    expect([...customers.values()][0].phoneE164).toBe('+639177654321')
    expect(orders[0].customerId).not.toBeNull()
  })

  it('never links a cancelled, refunded or voided order — those are not sales', async () => {
    const { store, customers, orders } = makeFakeStore([
      { id: 'c1', total: 100, createdAt: '2026-09-01T10:00:00.000Z', channel: 'Dine In' },
      { id: 'c2', total: 100, createdAt: '2026-09-02T10:00:00.000Z', channel: 'Dine In' },
      { id: 'c3', total: 100, createdAt: '2026-09-03T10:00:00.000Z', channel: 'Dine In' },
    ])
    const rows: BackfillOrderRow[] = ['cancelled', 'Refunded', 'voided'].map((status, i) => ({
      id: `c${i + 1}`,
      name: 'Dan',
      contact: '09171112222',
      customerData: null,
      customerId: null,
      status,
    }))

    const report = await backfillCustomers(store, 'tenant-1', rows, { execute: true })

    expect(report.reversed).toBe(3)
    expect(report.identifiable).toBe(0)
    expect(customers.size).toBe(0)
    expect(orders.every((o) => o.customerId === null)).toBe(true)
  })

  it('leaves orders that are already linked alone and reports them', async () => {
    const { store, customers } = makeFakeStore([
      { id: 'l1', total: 100, createdAt: '2026-09-01T10:00:00.000Z', channel: 'Pickup' },
    ])
    const rows: BackfillOrderRow[] = [
      {
        id: 'l1',
        name: 'Eve',
        contact: '09173334444',
        customerData: null,
        customerId: 'cust_existing',
        status: 'delivered',
      },
    ]

    const report = await backfillCustomers(store, 'tenant-1', rows, { execute: true })

    expect(report.alreadyLinked).toBe(1)
    expect(report.identifiable).toBe(0)
    expect(customers.size).toBe(0)
  })

  it('dry run says how many profiles it would create versus reuse, writing nothing', async () => {
    const { store, customers, orders } = makeFakeStore([
      { id: 'n1', total: 100, createdAt: '2026-09-01T10:00:00.000Z', channel: 'Dine In' },
      { id: 'n2', total: 200, createdAt: '2026-09-02T10:00:00.000Z', channel: 'Dine In' },
      { id: 'n3', total: 300, createdAt: '2026-09-03T10:00:00.000Z', channel: 'Dine In' },
    ])
    await store.createCustomer({ tenantId: 'tenant-1', phoneE164: '+639175556666', email: null, name: 'Fe' })
    const rows: BackfillOrderRow[] = [
      { id: 'n1', name: 'Fe', contact: '09175556666', customerData: null, customerId: null, status: 'delivered' },
      { id: 'n2', name: 'Gil', contact: '09177778888', customerData: null, customerId: null, status: 'pending' },
      { id: 'n3', name: 'Gil', contact: '+63 917 777 8888', customerData: null, customerId: null, status: 'delivered' },
    ]

    const report = await backfillCustomers(store, 'tenant-1', rows)

    expect(report.identifiable).toBe(3)
    expect(report.customersTouched).toBe(2)
    expect(report.newCustomers).toBe(1)
    expect(customers.size).toBe(1)
    expect(orders.every((o) => o.customerId === null)).toBe(true)
  })
})
