/** @jest-environment node */
import { readOrderCustomers } from '@/lib/loyalty/order-customer-repository'
import { fakeSupabaseTables, type FakeRow } from '../../fixtures/fake-supabase-tables'

const TENANT = 'tenant-1'
const NOW = Date.parse('2026-09-26T00:00:00Z')

function seed(): Record<string, FakeRow[]> {
  return {
    tenants: [{ id: TENANT, loyalty_enabled: true, loyalty_shadow: false }],
    loyalty_programs: [
      {
        id: 'prog-1',
        tenant_id: TENANT,
        name: 'Coffee Card',
        status: 'active',
        earn_mode: 'stamp',
        current_version_id: 'ver-1',
      },
    ],
    loyalty_program_versions: [
      {
        id: 'ver-1',
        rules: {
          earnMode: 'stamp',
          threshold: 10,
          pointsPerPeso: null,
          minSpend: null,
          reward: { type: 'fixed', amount: 100 },
          rewardExpiryDays: null,
          isExclusive: true,
        },
      },
    ],
    loyalty_balances: [
      {
        id: 'bal-1',
        tenant_id: TENANT,
        program_id: 'prog-1',
        customer_key: 'phone:+639171111111',
        customer_id: 'cust-1',
        balance: '4.00',
        lifetime_earned: '4.00',
        rewards_issued: 0,
        updated_at: '2026-09-25T00:00:00Z',
      },
    ],
    loyalty_entitlements: [],
    loyalty_ledger: [
      {
        id: 'led-1',
        tenant_id: TENANT,
        order_backend: 'convex',
        external_order_id: 'order-member',
        program_id: 'prog-1',
        customer_key: 'phone:+639171111111',
        kind: 'earn',
        delta: '1',
        is_shadow: false,
      },
    ],
    customers: [
      {
        id: 'cust-1',
        tenant_id: TENANT,
        name: 'Ana Cruz',
        phone_e164: '+639171111111',
        order_count: 12,
        total_spent: '5400',
      },
      {
        id: 'cust-2',
        tenant_id: TENANT,
        name: 'Ben Reyes',
        phone_e164: '+639172222222',
        order_count: 3,
        total_spent: '900',
      },
    ],
  }
}

function order(orderId: string, contact: string | null, status = 'pending') {
  return { orderId, contact, customerData: null, status }
}

describe('readOrderCustomers', () => {
  it('names a member, shows their card and the stamp this order earned', async () => {
    // Arrange
    const { client } = fakeSupabaseTables(seed())

    // Act
    const result = await readOrderCustomers(
      client,
      TENANT,
      { backend: 'convex', orders: [order('order-member', '0917 111 1111', 'delivered')] },
      NOW
    )

    // Assert
    expect(result.isLoyaltyLive).toBe(true)
    expect(result.customers).toHaveLength(1)
    const [ana] = result.customers
    expect(ana).toMatchObject({
      orderId: 'order-member',
      customerKey: 'phone:+639171111111',
      customerId: 'cust-1',
      name: 'Ana Cruz',
      hasProfile: true,
      orderCount: 12,
      isMember: true,
      stamp: { state: 'earned', delta: 1, programId: 'prog-1', programName: 'Coffee Card' },
    })
    expect(ana.headline?.balance).toBe(4)
    expect(ana.headline?.threshold).toBe(10)
  })

  it('recognises a customer with a profile but no card yet', async () => {
    const { client } = fakeSupabaseTables(seed())

    const result = await readOrderCustomers(
      client,
      TENANT,
      { backend: 'convex', orders: [order('order-ben', '+63 917 222 2222')] },
      NOW
    )

    expect(result.customers[0]).toMatchObject({
      name: 'Ben Reyes',
      hasProfile: true,
      isMember: false,
      headline: null,
      stamp: { state: 'pending' },
    })
  })

  it('finds the member behind a receipt-claimed stamp even when the order carries no number', async () => {
    const { client } = fakeSupabaseTables(seed())

    const result = await readOrderCustomers(
      client,
      TENANT,
      { backend: 'convex', orders: [order('order-member', null, 'delivered')] },
      NOW
    )

    expect(result.customers[0]?.customerKey).toBe('phone:+639171111111')
  })

  it('leaves out anonymous orders and numbers the store has never seen', async () => {
    const { client } = fakeSupabaseTables(seed())

    const result = await readOrderCustomers(
      client,
      TENANT,
      {
        backend: 'convex',
        orders: [order('walk-in', null), order('stranger', '09179999999')],
      },
      NOW
    )

    expect(result.customers).toEqual([])
  })

  it('does not match a stamp earned on a different backend under the same id', async () => {
    const { client } = fakeSupabaseTables(seed())

    const result = await readOrderCustomers(
      client,
      TENANT,
      { backend: 'platform_supabase', orders: [order('order-member', null, 'delivered')] },
      NOW
    )

    expect(result.customers).toEqual([])
  })

  it('promises no stamp while the store is not live', async () => {
    const tables = seed()
    tables.tenants = [{ id: TENANT, loyalty_enabled: true, loyalty_shadow: true }]
    const { client } = fakeSupabaseTables(tables)

    const result = await readOrderCustomers(
      client,
      TENANT,
      { backend: 'convex', orders: [order('order-ben', '09172222222')] },
      NOW
    )

    expect(result.isLoyaltyLive).toBe(false)
    expect(result.customers[0]?.stamp.state).toBe('none')
  })

  it('reads nothing for an empty page', async () => {
    const { client, seen } = fakeSupabaseTables(seed())

    const result = await readOrderCustomers(client, TENANT, { backend: 'convex', orders: [] }, NOW)

    expect(result).toEqual({ isLoyaltyLive: false, customers: [] })
    expect(seen).toEqual([])
  })

  it('fails loudly when the ledger cannot be read, rather than reporting no stamps', async () => {
    const { client } = fakeSupabaseTables(seed(), { loyalty_ledger: 'timeout' })

    await expect(
      readOrderCustomers(client, TENANT, { backend: 'convex', orders: [order('o', '09171111111')] }, NOW)
    ).rejects.toThrow(/ledger/i)
  })
})
