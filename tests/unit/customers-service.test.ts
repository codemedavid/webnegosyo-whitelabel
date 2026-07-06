import { describe, it, expect } from '@jest/globals'
import {
  upsertCustomerFromOrder,
  rowToFacts,
  type CustomerStore,
  type NewCustomerInput,
  type CustomerProfilePatch,
  type CustomerOrderFacts,
} from '@/lib/customers-service'

/**
 * In-memory CustomerStore for exercising the upsert orchestration without a live
 * database. It mimics the two DB facts the orchestration relies on:
 *   - customers are keyed per tenant by phone (email fallback when phone is null),
 *   - the aggregate is recomputed from the orders currently LINKED to a customer.
 *
 * `seedOrders` stand in for rows already inserted into `orders` (the going-forward
 * upsert always runs after the order row exists). Linking an order sets its
 * customerId; listing returns only linked orders — exactly the Supabase behavior.
 */
interface FakeOrderRow extends CustomerOrderFacts {
  id: string
  customerId: string | null
}

interface StoredCustomer extends NewCustomerInput {
  profile: CustomerProfilePatch | null
}

function makeFakeStore(seedOrders: Array<Omit<FakeOrderRow, 'customerId'>>) {
  const customers = new Map<string, StoredCustomer>()
  const orders: FakeOrderRow[] = seedOrders.map((o) => ({ ...o, customerId: null }))
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

describe('upsertCustomerFromOrder', () => {
  it('creates one customer profile from a single order', async () => {
    const { store, customers } = makeFakeStore([
      { id: 'o1', total: 250, createdAt: '2026-01-01T10:00:00.000Z', channel: 'Pickup', items: [{ name: 'Latte', quantity: 2 }] },
    ])

    const customerId = await upsertCustomerFromOrder(store, 'tenant-1', {
      orderId: 'o1',
      name: 'Ana',
      contact: '0917 123 4567',
      customerData: null,
    })

    expect(customerId).toBe('cust_1')
    expect(customers.size).toBe(1)
    const profile = customers.get('cust_1')!.profile!
    expect(profile.orderCount).toBe(1)
    expect(profile.totalSpent).toBe(250)
    expect(profile.phoneE164).toBe('+639171234567')
    expect(profile.channelsUsed).toEqual(['Pickup'])
  })

  it('is idempotent — replaying the same order never double-counts', async () => {
    const { store, customers } = makeFakeStore([
      { id: 'o1', total: 250, createdAt: '2026-01-01T10:00:00.000Z', channel: 'Pickup' },
    ])

    const input = { orderId: 'o1', name: 'Ana', contact: '+639171234567', customerData: null }
    await upsertCustomerFromOrder(store, 'tenant-1', input)
    await upsertCustomerFromOrder(store, 'tenant-1', input)
    await upsertCustomerFromOrder(store, 'tenant-1', input)

    expect(customers.size).toBe(1)
    const profile = customers.get('cust_1')!.profile!
    expect(profile.orderCount).toBe(1)
    expect(profile.totalSpent).toBe(250)
  })

  it('dedupes multiple orders from the same phone into one growing profile', async () => {
    const { store, customers } = makeFakeStore([
      { id: 'o1', total: 100, createdAt: '2026-01-01T10:00:00.000Z', channel: 'Pickup' },
      { id: 'o2', total: 300, createdAt: '2026-02-01T10:00:00.000Z', channel: 'Delivery' },
    ])

    await upsertCustomerFromOrder(store, 'tenant-1', { orderId: 'o1', name: 'Ana', contact: '09171234567', customerData: null })
    await upsertCustomerFromOrder(store, 'tenant-1', { orderId: 'o2', name: 'Ana', contact: '+639171234567', customerData: null })
    // Replay the first order — must not inflate counts.
    await upsertCustomerFromOrder(store, 'tenant-1', { orderId: 'o1', name: 'Ana', contact: '09171234567', customerData: null })

    expect(customers.size).toBe(1)
    const profile = customers.get('cust_1')!.profile!
    expect(profile.orderCount).toBe(2)
    expect(profile.totalSpent).toBe(400)
    expect(profile.averageOrderValue).toBe(200)
    expect(profile.channelsUsed).toEqual(['Pickup', 'Delivery'])
    expect(profile.firstOrderAt).toBe('2026-01-01T10:00:00.000Z')
    expect(profile.lastOrderAt).toBe('2026-02-01T10:00:00.000Z')
  })

  it('skips anonymous / walk-in orders (no identity, no customer row)', async () => {
    const { store, customers } = makeFakeStore([
      { id: 'o1', total: 90, createdAt: '2026-01-01T10:00:00.000Z', channel: 'Dine-in' },
    ])

    const result = await upsertCustomerFromOrder(store, 'tenant-1', {
      orderId: 'o1',
      name: 'Walk-in',
      contact: 'walk-in',
      customerData: null,
    })

    expect(result).toBeNull()
    expect(customers.size).toBe(0)
  })

  it('falls back to email identity when there is no phone', async () => {
    const { store, customers } = makeFakeStore([
      { id: 'o1', total: 500, createdAt: '2026-01-01T10:00:00.000Z', channel: 'Delivery' },
    ])

    const customerId = await upsertCustomerFromOrder(store, 'tenant-1', {
      orderId: 'o1',
      name: 'Ben',
      contact: null,
      customerData: { customer_email: 'Ben@Example.com' },
    })

    expect(customerId).toBe('cust_1')
    const stored = customers.get('cust_1')!
    expect(stored.phoneE164).toBeNull()
    expect(stored.email).toBe('ben@example.com')
    expect(stored.profile!.orderCount).toBe(1)
  })

  it('carries SMS consent captured on the order into the profile', async () => {
    const { store, customers } = makeFakeStore([
      { id: 'o1', total: 120, createdAt: '2026-03-01T10:00:00.000Z', channel: 'Dine-in', smsConsent: true },
    ])

    await upsertCustomerFromOrder(store, 'tenant-1', {
      orderId: 'o1',
      name: 'Cy',
      contact: '09181234567',
      customerData: null,
    })

    const profile = customers.get('cust_1')!.profile!
    expect(profile.smsConsent).toBe(true)
    expect(profile.smsConsentAt).toBe('2026-03-01T10:00:00.000Z')
  })
})

describe('rowToFacts', () => {
  it('coerces a string total to a number and reads the channel', () => {
    const facts = rowToFacts({
      total: '349.50',
      created_at: '2026-01-01T10:00:00.000Z',
      order_type: 'Delivery',
      customer_data: null,
      order_items: [{ menu_item_name: 'Sisig', quantity: 2 }],
    })

    expect(facts.total).toBe(349.5)
    expect(facts.channel).toBe('Delivery')
    expect(facts.items).toEqual([{ name: 'Sisig', quantity: 2 }])
    expect(facts.smsConsent).toBe(false)
  })

  it('drops items with no name and defaults dirty numbers to 0', () => {
    const facts = rowToFacts({
      total: null,
      created_at: '2026-01-01T10:00:00.000Z',
      order_type: null,
      customer_data: {},
      order_items: [
        { menu_item_name: null, quantity: 3 },
        { menu_item_name: 'Rice', quantity: null },
      ],
    })

    expect(facts.total).toBe(0)
    expect(facts.channel).toBeNull()
    expect(facts.items).toEqual([{ name: 'Rice', quantity: 0 }])
  })

  it('reads sms_consent out of customer_data only when strictly true', () => {
    expect(
      rowToFacts({
        total: 10,
        created_at: '2026-01-01T10:00:00.000Z',
        order_type: 'Dine-in',
        customer_data: { sms_consent: true },
        order_items: [],
      }).smsConsent
    ).toBe(true)

    expect(
      rowToFacts({
        total: 10,
        created_at: '2026-01-01T10:00:00.000Z',
        order_type: 'Dine-in',
        customer_data: { sms_consent: 'yes' },
        order_items: [],
      }).smsConsent
    ).toBe(false)
  })
})
