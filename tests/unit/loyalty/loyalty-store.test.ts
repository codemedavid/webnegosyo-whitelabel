import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseLoyaltyDeps, loadLoyaltyOrderFact, loadLoyaltyTenantFlags } from '@/lib/loyalty/store'

describe('loyalty earn history', () => {
  function database(data: unknown[], error: { message: string } | null = null) {
    const filters: Record<string, unknown> = {}
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query },
      maybeSingle: async () => ({ data: data[0] ?? null, error }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
    }
    const client = { from: () => query } as unknown as SupabaseClient
    return { client, deps: createSupabaseLoyaltyDeps(client), filters }
  }

  it('reads only the tenant and order requested and preserves original earning attribution', async () => {
    const { deps, filters } = database([{ program_id: 'old-program', version_id: 'old-version', customer_key: 'phone:old', delta: '12', is_shadow: true }])
    expect(await deps.loadOrderEarns('tenant', 'convex', 'order')).toEqual([
      { programId: 'old-program', versionId: 'old-version', customerKey: 'phone:old', delta: 12, isShadow: true },
    ])
    expect(filters).toEqual({ tenant_id: 'tenant', order_backend: 'convex', external_order_id: 'order', kind: 'earn' })
  })

  it('fails loudly when earning history cannot be read', async () => {
    const { deps } = database([], { message: 'connection lost' })
    await expect(deps.loadOrderEarns('tenant', 'convex', 'order')).rejects.toThrow('connection lost')
  })

  it('does not mistake failed tenant and order reads for disabled loyalty or a missing order', async () => {
    const { client } = database([], { message: 'connection lost' })
    await expect(loadLoyaltyTenantFlags(client, 'tenant')).rejects.toThrow('connection lost')
    for (const backend of ['convex', 'platform_supabase'] as const) {
      await expect(loadLoyaltyOrderFact(client, { tenantId: 'tenant', backend, externalOrderId: 'order' })).rejects.toThrow('connection lost')
    }
  })
})

describe('import twin lookup', () => {
  function database(row: Record<string, unknown> | null) {
    const filters: Array<[string, unknown]> = []
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
      limit: () => query,
      maybeSingle: async () => ({ data: row, error: null }),
    }
    const client = { from: () => query } as unknown as SupabaseClient
    return { deps: createSupabaseLoyaltyDeps(client), filters }
  }
  const base = {
    customerId: null, phoneE164: '+639171234567', source: 'online' as const, status: 'delivered', paymentStatus: 'paid',
    branchId: null, netTotal: 100, orderedAt: '2026-09-01T00:00:00Z', completedAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z', items: [],
  }

  it('finds the platform copy of a Convex order by the id the import stamped on it', async () => {
    const { deps, filters } = database({ id: 'platform-1' })
    const twin = await deps.findImportTwin!('tenant', { ...base, backend: 'convex', externalOrderId: 'cx-1' })
    expect(twin).toEqual({ ref: { backend: 'platform_supabase', externalOrderId: 'platform-1' }, isPrimary: true })
    expect(filters).toEqual([['tenant_id', 'tenant'], ['customer_data->>convex_order_id', 'cx-1']])
  })

  it('names the Convex original of an imported platform order', async () => {
    const { deps } = database({ customer_data: { convex_order_id: 'cx-1' } })
    const twin = await deps.findImportTwin!('tenant', { ...base, backend: 'platform_supabase', externalOrderId: 'platform-1' })
    expect(twin).toEqual({ ref: { backend: 'convex', externalOrderId: 'cx-1' }, isPrimary: false })
  })

  it('finds no twin for a native order or a tenant-Supabase order', async () => {
    expect(await database({ customer_data: {} }).deps.findImportTwin!('tenant', { ...base, backend: 'platform_supabase', externalOrderId: 'p' })).toBeNull()
    expect(await database(null).deps.findImportTwin!('tenant', { ...base, backend: 'convex', externalOrderId: 'cx-9' })).toBeNull()
    expect(await database({ id: 'x' }).deps.findImportTwin!('tenant', { ...base, backend: 'tenant_supabase', externalOrderId: 't' })).toBeNull()
  })
})
