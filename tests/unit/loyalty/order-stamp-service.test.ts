import { getOrderStampStatus } from '@/lib/loyalty/order-stamp-service'
import { fetchOrderTrackingData } from '@/lib/order-tracking-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { verifyTrackingToken } from '@/lib/tracking-token'

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/convex/server', () => ({ createConvexServerClient: jest.fn() }))
jest.mock('@/lib/tenant-secrets', () => ({ getTenantSecrets: jest.fn() }))
jest.mock('@/lib/tracking-token', () => ({ verifyTrackingToken: jest.fn() }))

const query = { orderId: 'order-1', tenantId: 'tenant-1', token: 'valid' }
let tables: Record<string, Record<string, unknown>[]>

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(verifyTrackingToken).mockReturnValue(true)
  tables = {
    tenants: [{ id: 'tenant-1', is_active: true, loyalty_enabled: true, loyalty_shadow: false }],
    orders: [{ id: 'order-1', tenant_id: 'tenant-1', status: 'pending', customer_contact: '09171234567', created_at: '2026-09-10T00:00:00Z', total: 100 }],
    loyalty_programs: [{ id: 'program-1', tenant_id: 'tenant-1', name: 'Coffee Club', scope: 'business', status: 'active', activates_at: '2026-01-01T00:00:00Z', current_version_id: 'version-1' }],
    loyalty_program_versions: [{ id: 'version-1', program_id: 'program-1', version: 1, created_at: '2026-01-01T00:00:00Z', rules: { earnMode: 'stamp', threshold: 8, minSpend: null, reward: { type: 'fixed', amount: 100 } } }],
    loyalty_ledger: [],
    loyalty_balances: [{ tenant_id: 'tenant-1', program_id: 'program-1', customer_key: 'phone:+639171234567', balance: 3 }],
    loyalty_entitlements: [{ id: 'reward-1', tenant_id: 'tenant-1', program_id: 'program-1', customer_key: 'phone:+639171234567', status: 'issued' }],
  }
  const from = (table: string) => {
    let rows = tables[table] ?? []
    let patch: Record<string, unknown> | null = null
    const result = () => {
      if (patch) rows.forEach(row => Object.assign(row, patch))
      return { data: rows, count: rows.length, error: null }
    }
    const builder = {
      select: () => builder,
      update: (value: Record<string, unknown>) => { patch = value; return builder },
      is: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return builder },
      eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return builder },
      in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return builder },
      not: () => builder,
      or: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    }
    return builder
  }
  const rpc = async (_name: string, args: Record<string, unknown>) => {
    const duplicate = tables.loyalty_ledger.some(row => row.external_order_id === args.p_external_order_id && row.program_id === args.p_program_id && row.kind === args.p_kind)
    if (duplicate) return { data: { applied: false, reason: 'duplicate' }, error: null }
    tables.loyalty_ledger.push({ tenant_id: args.p_tenant_id, program_id: args.p_program_id, version_id: args.p_version_id, customer_key: args.p_customer_key, kind: args.p_kind, delta: args.p_delta, is_shadow: args.p_shadow, external_order_id: args.p_external_order_id, order_backend: args.p_order_backend })
    const balance = tables.loyalty_balances[0]
    balance.balance = Number(balance.balance) + Number(args.p_delta)
    return { data: { applied: true, balance: balance.balance, entitlementsIssued: 0 }, error: null }
  }
  jest.mocked(createAdminClient).mockReturnValue({ from, rpc } as unknown as ReturnType<typeof createAdminClient>)
})

it('shows existing phone-linked progress and rewards immediately on a pending checkout order', async () => {
  expect(await getOrderStampStatus(query)).toMatchObject({
    ok: true,
    status: { hasContact: true, card: { programName: 'Coffee Club', balance: 3, rewardsAvailable: 1, threshold: 8 } },
  })
})

it.each(['platform_supabase', 'convex'])('reuses checkout form phone data on %s without exposing it in tracking data', async (backend) => {
  tables.orders[0].customer_contact = ''
  tables.orders[0].customer_data = { customer_phone: '0917 123 4567' }
  if (backend === 'convex') {
    tables.tenants[0].convex_deployment_url = 'https://test.convex.cloud'
    jest.mocked(getTenantSecrets).mockResolvedValue({ convex_deploy_key: 'key' } as Awaited<ReturnType<typeof getTenantSecrets>>)
    jest.mocked(createConvexServerClient).mockReturnValue({ query: async () => ({
      status: 'pending', customerContact: '', customerData: { customer_phone: '0917 123 4567' }, _creationTime: Date.now(),
    }) } as unknown as ReturnType<typeof createConvexServerClient>)
  }
  const tracking = await fetchOrderTrackingData(query.orderId, query.token, query.tenantId)
  expect(tracking.data?.hasContact).toBe(true)
  expect(JSON.stringify(tracking)).not.toMatch(/0917|63917|loyaltyIdentity|customerKey/)
  expect(await getOrderStampStatus(query)).toMatchObject({ ok: true, status: { hasContact: true, card: { balance: 3 } } })
})

it('shows an empty card for a first-time customer without inventing an earned stamp', async () => {
  tables.loyalty_balances = []
  tables.loyalty_entitlements = []
  expect(await getOrderStampStatus(query)).toMatchObject({ ok: true, status: { card: { balance: 0, rewardsAvailable: 0, earnedOnOrder: false } } })
})

it('keeps anonymous receipts on the claim form without reading another customer balance', async () => {
  tables.orders[0].customer_contact = ''
  expect(await getOrderStampStatus(query)).toMatchObject({ ok: true, status: { hasContact: false, card: null } })
})

it('uses this order’s original earning attribution for completed orders', async () => {
  tables.orders[0].status = 'delivered'
  tables.loyalty_ledger = [{ tenant_id: 'tenant-1', external_order_id: 'order-1', order_backend: 'platform_supabase', kind: 'earn', is_shadow: false, program_id: 'program-1', customer_key: 'phone:+639171234567' }]
  expect(await getOrderStampStatus(query)).toMatchObject({ ok: true, status: { claim: { state: 'closed' }, card: { balance: 3, earnedOnOrder: true } } })
})

it('does not reveal balances from another tenant or phone', async () => {
  tables.loyalty_balances = [
    { ...tables.loyalty_balances[0], tenant_id: 'other-tenant', balance: 99 },
    { ...tables.loyalty_balances[0], customer_key: 'phone:+639998887777', balance: 77 },
  ]
  tables.loyalty_entitlements[0].tenant_id = 'other-tenant'
  expect(await getOrderStampStatus(query)).toMatchObject({ ok: true, status: { card: { balance: 0, rewardsAvailable: 0 } } })
  expect(await getOrderStampStatus({ ...query, tenantId: 'other-tenant' })).toEqual({ ok: false, error: 'not_found' })
})

it('rejects an invalid tracking token before reading the database', async () => {
  jest.mocked(verifyTrackingToken).mockReturnValue(false)
  expect(await getOrderStampStatus(query)).toEqual({ ok: false, error: 'invalid_token' })
  expect(createAdminClient).not.toHaveBeenCalled()
})

it.each(['disabled', 'shadow', 'ended', 'future', 'wrong-branch'])('does not offer a new card for a %s program', async (mode) => {
  if (mode === 'disabled') tables.tenants[0].loyalty_enabled = false
  if (mode === 'shadow') tables.tenants[0].loyalty_shadow = true
  if (mode === 'ended') tables.loyalty_programs[0].ends_at = '2020-01-01T00:00:00Z'
  if (mode === 'future') tables.loyalty_programs[0].activates_at = '2099-01-01T00:00:00Z'
  if (mode === 'wrong-branch') Object.assign(tables.loyalty_programs[0], { scope: 'branch', outlet_id: 'other-outlet' })
  expect(await getOrderStampStatus(query)).toMatchObject({ ok: true, status: { card: null } })
})

function completedConvexOrder(status = 'delivered') {
  tables.tenants[0].convex_deployment_url = 'https://test.convex.cloud'
  jest.mocked(getTenantSecrets).mockResolvedValue({ convex_deploy_key: 'key' } as Awaited<ReturnType<typeof getTenantSecrets>>)
  jest.mocked(createConvexServerClient).mockReturnValue({ query: async () => ({
    status, source: 'web', customerContact: '09171234567', paymentStatus: 'pending', _creationTime: Date.parse('2026-09-10T00:00:00Z'),
  }) } as unknown as ReturnType<typeof createConvexServerClient>)
  tables.customers = [{ id: 'customer-1', tenant_id: 'tenant-1', phone_e164: '+639171234567' }]
  tables.customer_external_orders = [{ tenant_id: 'tenant-1', backend: 'convex', external_order_id: 'order-1', customer_id: 'customer-1', status: 'ready', payment_status: null, source: 'online', outlet_id: null, total: 100, ordered_at: '2026-09-10T00:00:00Z', updated_at: '2026-09-10T00:01:00Z', completed_at: null, items: [] }]
}

it('recovers a missed completion from Convex and credits exactly one stamp across repeated receipt loads', async () => {
  completedConvexOrder()
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(await getOrderStampStatus(query)).toMatchObject({ ok: true, status: { card: { balance: 4, earnedOnOrder: true } } })
  }
  expect(tables.customer_external_orders[0]).toMatchObject({ status: 'delivered', completed_at: expect.any(String) })
  expect(tables.loyalty_ledger).toHaveLength(1)
})

it('does not credit an unfinished Convex order', async () => {
  completedConvexOrder('ready')
  expect(await getOrderStampStatus(query)).toMatchObject({ ok: true, status: { card: { balance: 3, earnedOnOrder: false } } })
  expect(tables.loyalty_ledger).toHaveLength(0)
})

it('does not use an old receipt to credit a newly activated program', async () => {
  completedConvexOrder()
  tables.loyalty_programs[0].activates_at = '2026-09-10T01:00:00Z'
  for (let attempt = 0; attempt < 2; attempt++) await getOrderStampStatus(query)
  expect(tables.loyalty_ledger).toHaveLength(0)
})

it('does not replace a lifecycle event newer than the backend snapshot', async () => {
  completedConvexOrder()
  tables.customer_external_orders[0].status = 'cancelled'
  tables.customer_external_orders[0].updated_at = '2099-01-01T00:00:00Z'
  await getOrderStampStatus(query)
  expect(tables.customer_external_orders[0].status).toBe('cancelled')
  expect(tables.loyalty_ledger).toHaveLength(0)
})
