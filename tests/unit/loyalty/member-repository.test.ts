/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import { listLoyaltyMembers, readLoyaltyMemberDetail } from '@/lib/loyalty/member-repository'

const TENANT = 'tenant-1'
const NOW = Date.parse('2026-09-22T00:00:00Z')

type Row = Record<string, unknown>

/**
 * An in-memory stand-in for the service-role client: enough of the builder to
 * run the real queries, so a column the repository forgets to select shows up
 * as a missing field rather than passing silently.
 */
function database(tables: Record<string, Row[]>, failures: Record<string, string> = {}) {
  const seen: string[] = []

  function build(table: string) {
    let rows = [...(tables[table] ?? [])]
    let selected: string[] | null = null

    const query = {
      select(columns: string) {
        selected = columns.split(',').map((column) => column.trim())
        return query
      },
      eq(column: string, value: unknown) {
        rows = rows.filter((row) => row[column] === value)
        return query
      },
      in(column: string, values: readonly unknown[]) {
        rows = rows.filter((row) => values.includes(row[column] as never))
        return query
      },
      or() {
        return query
      },
      order(column: string, options?: { ascending?: boolean }) {
        const ascending = options?.ascending !== false
        rows = [...rows].sort((a, b) => {
          const left = String(a[column] ?? '')
          const right = String(b[column] ?? '')
          return ascending ? left.localeCompare(right) : right.localeCompare(left)
        })
        return query
      },
      range(from: number, to: number) {
        rows = rows.slice(from, to + 1)
        return settle()
      },
      limit(count: number) {
        rows = rows.slice(0, count)
        return settle()
      },
      async maybeSingle() {
        const result = await settle()
        const data = result.data as Row[] | null
        return { data: Array.isArray(data) ? data[0] ?? null : data, error: result.error }
      },
      then: (resolve: (value: unknown) => unknown) => settle().then(resolve),
    }

    async function settle() {
      seen.push(table)
      if (failures[table]) {
        return { data: null as Row[] | null, error: { message: failures[table] } as { message: string } | null }
      }
      const projected = selected
        ? rows.map((row) =>
            Object.fromEntries(selected!.filter((column) => column in row).map((column) => [column, row[column]]))
          )
        : rows
      return { data: projected as Row[] | null, error: null as { message: string } | null }
    }

    return query
  }

  return {
    client: { from: (table: string) => build(table) } as unknown as SupabaseClient,
    seen,
  }
}

function seed(): Record<string, Row[]> {
  return {
    loyalty_programs: [
      {
        id: 'prog-1',
        tenant_id: TENANT,
        name: 'Loyalty Card',
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
          reward: { type: 'fixed', amount: 200 },
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
        balance: '9.00',
        lifetime_earned: '9.00',
        rewards_issued: 0,
        updated_at: '2026-09-20T00:00:00Z',
      },
      {
        id: 'bal-2',
        tenant_id: TENANT,
        program_id: 'prog-1',
        customer_key: 'phone:+639172222222',
        customer_id: null,
        balance: '2.00',
        lifetime_earned: '2.00',
        rewards_issued: 0,
        updated_at: '2026-09-21T00:00:00Z',
      },
    ],
    loyalty_entitlements: [],
    customers: [
      {
        id: 'cust-1',
        tenant_id: TENANT,
        name: 'Ana Cruz',
        phone_e164: '+639171111111',
        email: null,
        order_count: 9,
        total_spent: '4500',
        average_order_value: '500',
        first_order_at: '2026-01-01T00:00:00Z',
        last_order_at: '2026-09-20T00:00:00Z',
        sms_consent: true,
        sms_opt_out: false,
        notes: null,
      },
      {
        id: 'cust-2',
        tenant_id: TENANT,
        name: 'Ben Reyes',
        phone_e164: '+639172222222',
        email: null,
      },
    ],
    orders: [],
    customer_external_orders: [],
  }
}

describe('listLoyaltyMembers', () => {
  it('ranks the customer closest to the reward first', async () => {
    // Arrange
    const { client } = database(seed())

    // Act
    const page = await listLoyaltyMembers(client, TENANT, { nowMs: NOW })

    // Assert
    expect(page.members.map((m) => m.phone)).toEqual(['+639171111111', '+639172222222'])
    expect(page.members[0].headline?.remaining).toBe(1)
    expect(page.members[0].status).toBe('almost_there')
  })

  it('names a member whose balance predates their customer row, via the phone', async () => {
    // bal-2 carries no customer_id; only the phone links it to Ben.
    const { client } = database(seed())

    const page = await listLoyaltyMembers(client, TENANT, { nowMs: NOW })

    expect(page.members.find((m) => m.phone === '+639172222222')?.name).toBe('Ben Reyes')
  })

  it('counts every state before a filter narrows the list', async () => {
    const { client } = database(seed())

    const page = await listLoyaltyMembers(client, TENANT, { nowMs: NOW, status: 'almost_there' })

    expect(page.members).toHaveLength(1)
    expect(page.totals.total).toBe(2)
    expect(page.totals.almostThere).toBe(1)
  })

  it('searches on name as well as number', async () => {
    const { client } = database(seed())

    const byName = await listLoyaltyMembers(client, TENANT, { nowMs: NOW, search: 'ben' })
    const byPhone = await listLoyaltyMembers(client, TENANT, { nowMs: NOW, search: '9171111' })

    expect(byName.members.map((m) => m.name)).toEqual(['Ben Reyes'])
    expect(byPhone.members.map((m) => m.name)).toEqual(['Ana Cruz'])
  })

  it('counts only rewards that can still be claimed', async () => {
    const tables = seed()
    tables.loyalty_entitlements = [
      { id: 'e1', tenant_id: TENANT, program_id: 'prog-1', customer_key: 'phone:+639171111111', status: 'issued' },
      { id: 'e2', tenant_id: TENANT, program_id: 'prog-1', customer_key: 'phone:+639171111111', status: 'consumed' },
    ]
    const { client } = database(tables)

    const page = await listLoyaltyMembers(client, TENANT, { nowMs: NOW })

    const ana = page.members.find((m) => m.phone === '+639171111111')
    expect(ana?.rewardsAvailable).toBe(1)
    expect(ana?.status).toBe('reward_ready')
  })

  it('fails loudly rather than reporting an empty programme when balances cannot be read', async () => {
    const { client } = database(seed(), { loyalty_balances: 'connection lost' })

    await expect(listLoyaltyMembers(client, TENANT, { nowMs: NOW })).rejects.toThrow('connection lost')
  })
})

describe('readLoyaltyMemberDetail', () => {
  it('merges order history from both backends, newest first', async () => {
    // A store that moved backends keeps history in two tables; reading one
    // showed half of it.
    const tables = seed()
    tables.orders = [
      {
        id: 'order-platform',
        tenant_id: TENANT,
        customer_id: 'cust-1',
        total: '500',
        created_at: '2026-09-01T00:00:00Z',
        order_type: 'Delivery',
        status: 'delivered',
        payment_status: 'paid',
        customer_data: { delivery_address: '12 Mabini St' },
      },
    ]
    tables.customer_external_orders = [
      {
        id: 'order-convex',
        tenant_id: TENANT,
        customer_id: 'cust-1',
        backend: 'convex',
        external_order_id: 'jh70mwef055zxzpv',
        total: '719',
        ordered_at: '2026-09-20T00:00:00Z',
        channel: 'Delivery',
        status: 'confirmed',
        payment_status: null,
        items: [{ name: 'Calamari', quantity: 1 }],
        address: '99 Rizal Ave',
      },
    ]
    const { client } = database(tables)

    const detail = await readLoyaltyMemberDetail(client, TENANT, 'phone:+639171111111', NOW)

    expect(detail?.orders.map((o) => o.backend)).toEqual(['convex', 'platform_supabase'])
    expect(detail?.addresses).toEqual(['99 Rizal Ave', '12 Mabini St'])
    expect(detail?.orders[0].items).toEqual([{ name: 'Calamari', quantity: 1 }])
  })

  it('carries the profile a merchant needs to call the customer', async () => {
    const { client } = database(seed())

    const detail = await readLoyaltyMemberDetail(client, TENANT, 'phone:+639171111111', NOW)

    expect(detail?.profile).toMatchObject({
      name: 'Ana Cruz',
      phone: '+639171111111',
      orderCount: 9,
      totalSpent: 4500,
      smsConsent: true,
    })
  })

  it('describes a reward from the terms frozen at issue, not the rules as they stand now', async () => {
    const tables = seed()
    tables.loyalty_entitlements = [
      {
        id: 'e1',
        tenant_id: TENANT,
        program_id: 'prog-1',
        customer_key: 'phone:+639171111111',
        status: 'issued',
        issued_at: '2026-09-10T00:00:00Z',
        expires_at: null,
        consumed_at: null,
        resolution_note: null,
        terms: { programName: 'Loyalty Card', reward: { type: 'fixed', amount: 150 } },
      },
    ]
    const { client } = database(tables)

    const detail = await readLoyaltyMemberDetail(client, TENANT, 'phone:+639171111111', NOW)

    expect(detail?.rewards[0].label).toBe('₱150 off')
    expect(detail?.rewards[0].isReserved).toBe(false)
  })

  it('flags a reward a register is holding so it cannot be settled by hand', async () => {
    const tables = seed()
    tables.loyalty_entitlements = [
      {
        id: 'e1',
        tenant_id: TENANT,
        program_id: 'prog-1',
        customer_key: 'phone:+639171111111',
        status: 'reserved',
        issued_at: '2026-09-10T00:00:00Z',
        expires_at: null,
        consumed_at: null,
        resolution_note: null,
        terms: {},
      },
    ]
    const { client } = database(tables)

    const detail = await readLoyaltyMemberDetail(client, TENANT, 'phone:+639171111111', NOW)

    expect(detail?.rewards[0].isReserved).toBe(true)
  })

  it('returns null for a customer who holds no card at this store', async () => {
    const { client } = database(seed())

    expect(await readLoyaltyMemberDetail(client, TENANT, 'phone:+639179999999', NOW)).toBeNull()
  })
})
