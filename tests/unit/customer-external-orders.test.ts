import { describe, it, expect } from '@jest/globals'
import {
  buildExternalLedgerRow,
  ledgerRowsToFacts,
  createExternalCustomerStore,
  captureExternalOrderCustomer,
  type ExternalOrderLedger,
  type ExternalLedgerRow,
  type ExternalOrderInput,
} from '@/lib/customer-external-orders'
import type {
  CustomerStore,
  NewCustomerInput,
  CustomerProfilePatch,
} from '@/lib/customers-service'

/**
 * In-memory ledger + identity store. Together they stand in for the two Supabase
 * tables the real capture path touches (`customer_external_orders` and
 * `customers`), so the orchestration can be exercised without a database.
 */
function makeFakeLedger() {
  const rows: ExternalLedgerRow[] = []

  const ledger: ExternalOrderLedger = {
    async upsert(row) {
      // Mirrors the (tenant_id, backend, external_order_id) unique constraint.
      const index = rows.findIndex(
        (r) =>
          r.tenant_id === row.tenant_id &&
          r.backend === row.backend &&
          r.external_order_id === row.external_order_id
      )
      if (index >= 0) rows[index] = row
      else rows.push(row)
    },
    async listByCustomer(customerId) {
      return ledgerRowsToFacts(rows.filter((r) => r.customer_id === customerId))
    },
  }

  return { ledger, rows }
}

interface StoredCustomer extends NewCustomerInput {
  profile: CustomerProfilePatch | null
}

function makeFakeIdentityStore() {
  const customers = new Map<string, StoredCustomer>()
  let seq = 0

  const identity: Pick<
    CustomerStore,
    'findCustomerId' | 'createCustomer' | 'saveCustomerProfile'
  > = {
    async findCustomerId(tenantId, phoneE164, email) {
      for (const [id, c] of customers) {
        if (c.tenantId !== tenantId) continue
        if (phoneE164 && c.phoneE164 === phoneE164) return id
        if (!phoneE164 && email && c.phoneE164 == null && c.email === email) return id
      }
      return null
    },
    async createCustomer(input) {
      const id = `cust_${++seq}`
      customers.set(id, { ...input, profile: null })
      return id
    },
    async saveCustomerProfile(customerId, patch) {
      const existing = customers.get(customerId)
      if (existing) customers.set(customerId, { ...existing, profile: patch })
    },
  }

  return { identity, customers }
}

function convexOrder(overrides: Partial<ExternalOrderInput> = {}): ExternalOrderInput {
  return {
    backend: 'convex',
    externalOrderId: 'convex_order_1',
    name: 'Ana Cruz',
    contact: '09171234567',
    customerData: null,
    total: 450,
    createdAt: '2026-03-01T10:00:00.000Z',
    channel: 'Pickup',
    items: [{ name: 'Latte', quantity: 2 }],
    ...overrides,
  }
}

describe('buildExternalLedgerRow', () => {
  it('maps an order onto the ledger row shape', () => {
    const row = buildExternalLedgerRow('tenant-1', 'cust-1', convexOrder())

    expect(row).toEqual({
      tenant_id: 'tenant-1',
      customer_id: 'cust-1',
      backend: 'convex',
      external_order_id: 'convex_order_1',
      total: 450,
      ordered_at: '2026-03-01T10:00:00.000Z',
      channel: 'Pickup',
      items: [{ name: 'Latte', quantity: 2 }],
      sms_consent: false,
    })
  })

  it('accepts a Convex epoch-millisecond creation time', () => {
    const row = buildExternalLedgerRow(
      'tenant-1',
      'cust-1',
      convexOrder({ createdAt: Date.parse('2026-03-01T10:00:00.000Z') })
    )

    expect(row.ordered_at).toBe('2026-03-01T10:00:00.000Z')
  })

  it('coerces a dirty total and missing items to safe defaults', () => {
    const row = buildExternalLedgerRow(
      'tenant-1',
      'cust-1',
      convexOrder({ total: Number.NaN, items: undefined, channel: null })
    )

    expect(row.total).toBe(0)
    expect(row.items).toEqual([])
    expect(row.channel).toBeNull()
  })
})

describe('ledgerRowsToFacts', () => {
  it('maps ledger rows back to aggregate inputs', () => {
    const facts = ledgerRowsToFacts([
      buildExternalLedgerRow('t', 'c', convexOrder()),
      buildExternalLedgerRow('t', 'c', convexOrder({ externalOrderId: 'o2', total: 150 })),
    ])

    expect(facts).toEqual([
      {
        total: 450,
        createdAt: '2026-03-01T10:00:00.000Z',
        channel: 'Pickup',
        items: [{ name: 'Latte', quantity: 2 }],
        smsConsent: false,
      },
      {
        total: 150,
        createdAt: '2026-03-01T10:00:00.000Z',
        channel: 'Pickup',
        items: [{ name: 'Latte', quantity: 2 }],
        smsConsent: false,
      },
    ])
  })
})

describe('createExternalCustomerStore', () => {
  it('satisfies the CustomerStore port by reading order facts from the ledger', async () => {
    const { ledger } = makeFakeLedger()
    const { identity } = makeFakeIdentityStore()
    const store = createExternalCustomerStore(identity, ledger, 'tenant-1', convexOrder())

    await store.linkOrderToCustomer('convex_order_1', 'cust-1')

    expect(await store.listCustomerOrders('cust-1')).toEqual([
      {
        total: 450,
        createdAt: '2026-03-01T10:00:00.000Z',
        channel: 'Pickup',
        items: [{ name: 'Latte', quantity: 2 }],
        smsConsent: false,
      },
    ])
  })
})

describe('captureExternalOrderCustomer', () => {
  it('creates a customer from a Convex order with a phone number', async () => {
    const { ledger } = makeFakeLedger()
    const { identity, customers } = makeFakeIdentityStore()

    const customerId = await captureExternalOrderCustomer(
      identity,
      ledger,
      'tenant-1',
      convexOrder()
    )

    expect(customerId).toBe('cust_1')
    const stored = customers.get('cust_1')
    expect(stored?.phoneE164).toBe('+639171234567')
    expect(stored?.profile?.orderCount).toBe(1)
    expect(stored?.profile?.totalSpent).toBe(450)
    expect(stored?.profile?.topItems).toEqual([{ name: 'Latte', quantity: 2 }])
  })

  it('recovers the phone from customerData when the contact field is blank', async () => {
    const { ledger } = makeFakeLedger()
    const { identity, customers } = makeFakeIdentityStore()
    const order = convexOrder({
      contact: '',
      customerData: { customer_phone: '0917 123 4567' },
    })

    await captureExternalOrderCustomer(identity, ledger, 'tenant-1', order)

    expect(customers.get('cust_1')?.phoneE164).toBe('+639171234567')
  })

  it('joins a second order onto the same customer and grows the profile', async () => {
    const { ledger } = makeFakeLedger()
    const { identity, customers } = makeFakeIdentityStore()

    const first = convexOrder()
    await captureExternalOrderCustomer(identity, ledger, 'tenant-1', first)

    // Same person, different phone formatting and a later date.
    const second = convexOrder({
      externalOrderId: 'convex_order_2',
      contact: '+639171234567',
      total: 250,
      createdAt: '2026-03-05T10:00:00.000Z',
      channel: 'Delivery',
      items: [{ name: 'Latte', quantity: 1 }],
    })
    const secondId = await captureExternalOrderCustomer(identity, ledger, 'tenant-1', second)

    expect(secondId).toBe('cust_1')
    const profile = customers.get('cust_1')?.profile
    expect(profile?.orderCount).toBe(2)
    expect(profile?.totalSpent).toBe(700)
    expect(profile?.channelsUsed).toEqual(['Pickup', 'Delivery'])
    expect(profile?.topItems).toEqual([{ name: 'Latte', quantity: 3 }])
    expect(profile?.firstOrderAt).toBe('2026-03-01T10:00:00.000Z')
    expect(profile?.lastOrderAt).toBe('2026-03-05T10:00:00.000Z')
  })

  it('is idempotent — replaying the same external order never double-counts', async () => {
    const { ledger, rows } = makeFakeLedger()
    const { identity, customers } = makeFakeIdentityStore()
    const order = convexOrder()

    for (let i = 0; i < 3; i++) {
      await captureExternalOrderCustomer(identity, ledger, 'tenant-1', order)
    }

    expect(rows).toHaveLength(1)
    expect(customers.get('cust_1')?.profile?.orderCount).toBe(1)
    expect(customers.get('cust_1')?.profile?.totalSpent).toBe(450)
  })

  it('keeps the same external order id separate across backends', async () => {
    const { ledger, rows } = makeFakeLedger()
    const { identity } = makeFakeIdentityStore()

    const fromConvex = convexOrder()
    const fromSupabase = convexOrder({ backend: 'tenant_supabase' })

    await captureExternalOrderCustomer(identity, ledger, 'tenant-1', fromConvex)
    await captureExternalOrderCustomer(identity, ledger, 'tenant-1', fromSupabase)

    expect(rows).toHaveLength(2)
  })

  it('never creates a customer for an anonymous walk-in order', async () => {
    const { ledger, rows } = makeFakeLedger()
    const { identity, customers } = makeFakeIdentityStore()
    const order = convexOrder({ name: 'Guest', contact: 'walk-in', customerData: null })

    const customerId = await captureExternalOrderCustomer(identity, ledger, 'tenant-1', order)

    expect(customerId).toBeNull()
    expect(rows).toHaveLength(0)
    expect(customers.size).toBe(0)
  })

  it('records SMS consent carried in customerData', async () => {
    const { ledger } = makeFakeLedger()
    const { identity, customers } = makeFakeIdentityStore()
    const order = convexOrder({
      customerData: { customer_phone: '09171234567', sms_consent: true },
    })

    await captureExternalOrderCustomer(identity, ledger, 'tenant-1', order)

    expect(customers.get('cust_1')?.profile?.smsConsent).toBe(true)
  })
})
