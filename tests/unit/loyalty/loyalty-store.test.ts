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
