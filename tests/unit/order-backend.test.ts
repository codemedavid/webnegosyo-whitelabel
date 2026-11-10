import { describe, it, expect } from '@jest/globals'
import {
  resolveOrderBackend,
  assertOrderBackendReady,
  type OrderBackendTenantFields,
} from '@/lib/order-backend'

/**
 * The retired third backend: a store's own, separate Supabase project. The
 * `order_backend` CHECK still allows the word, so a stale row (or a stale
 * client) can still present it. It is typed out of the union on purpose.
 */
const RETIRED_SUPABASE_PIN = 'supabase' as unknown as OrderBackendTenantFields['order_backend']

function makeTenant(
  overrides: Partial<OrderBackendTenantFields> = {}
): OrderBackendTenantFields {
  return {
    order_backend: null,
    convex_deployment_url: null,
    convex_deploy_key: null,
    ...overrides,
  }
}

describe('resolveOrderBackend', () => {
  it('honors an explicit convex selection', () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: 'convex' }))).toBe('convex')
  })

  it('honors an explicit platform selection', () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: 'platform' }))).toBe('platform')
  })

  it('falls back to convex when no explicit backend but convex url is present (legacy)', () => {
    const tenant = makeTenant({
      order_backend: null,
      convex_deployment_url: 'https://tenant.convex.cloud',
    })
    expect(resolveOrderBackend(tenant)).toBe('convex')
  })

  it('falls back to platform when no explicit backend and no convex url (legacy default)', () => {
    expect(resolveOrderBackend(makeTenant())).toBe('platform')
  })

  it('ignores an unknown order_backend value and uses the legacy fallback', () => {
    const tenant = makeTenant({
      // Simulate a corrupt/unexpected column value.
      order_backend: 'mysql' as unknown as OrderBackendTenantFields['order_backend'],
      convex_deployment_url: 'https://tenant.convex.cloud',
    })
    expect(resolveOrderBackend(tenant)).toBe('convex')
  })
})

describe("resolveOrderBackend — a stale 'supabase' pin (the retired own-project backend)", () => {
  it('only ever answers convex or platform', () => {
    const answers = [
      resolveOrderBackend(makeTenant({ order_backend: RETIRED_SUPABASE_PIN })),
      resolveOrderBackend(
        makeTenant({ order_backend: RETIRED_SUPABASE_PIN, convex_deployment_url: 'https://tenant.convex.cloud' })
      ),
    ]
    for (const answer of answers) expect(['convex', 'platform']).toContain(answer)
  })

  it('routes to the shared platform database when no Convex deployment is configured', () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: RETIRED_SUPABASE_PIN }))).toBe('platform')
  })

  it('routes to Convex when a deployment is configured', () => {
    const tenant = makeTenant({
      order_backend: RETIRED_SUPABASE_PIN,
      convex_deployment_url: 'https://tenant.convex.cloud',
    })
    expect(resolveOrderBackend(tenant)).toBe('convex')
  })

  it('resolves exactly like auto for every credential state', () => {
    const credentialStates: Array<Partial<OrderBackendTenantFields>> = [
      {},
      { convex_deployment_url: '' },
      { convex_deployment_url: '   ' },
      { convex_deployment_url: 'https://tenant.convex.cloud' },
      { convex_deployment_url: 'https://tenant.convex.cloud', convex_deploy_key: 'deploy-key' },
    ]
    for (const credentials of credentialStates) {
      expect(resolveOrderBackend(makeTenant({ ...credentials, order_backend: RETIRED_SUPABASE_PIN }))).toBe(
        resolveOrderBackend(makeTenant({ ...credentials, order_backend: 'auto' }))
      )
    }
  })

  it('ignores leftover per-store credential columns on the row', () => {
    // The four columns still exist until the drop migration is applied; a row
    // read with select('*') carries them. They must not influence routing.
    const row = {
      ...makeTenant({ order_backend: RETIRED_SUPABASE_PIN }),
      supabase_order_url: 'https://abcdefgh.supabase.co',
      supabase_order_anon_key: 'anon-key-123',
      supabase_order_service_key: 'service-role-key-456',
      supabase_order_db_url: 'postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres',
    }
    expect(resolveOrderBackend(row)).toBe('platform')
  })
})

describe('assertOrderBackendReady', () => {
  it('does not throw for a platform tenant (always ready)', () => {
    expect(() => assertOrderBackendReady(makeTenant({ order_backend: 'platform' }))).not.toThrow()
  })

  it('does not throw when convex is selected and convex creds exist', () => {
    const tenant = makeTenant({
      order_backend: 'convex',
      convex_deployment_url: 'https://tenant.convex.cloud',
      convex_deploy_key: 'deploy-key',
    })
    expect(() => assertOrderBackendReady(tenant)).not.toThrow()
  })

  it('throws loudly when convex is selected but creds are missing', () => {
    expect(() => assertOrderBackendReady(makeTenant({ order_backend: 'convex' }))).toThrow(
      /convex/i
    )
  })

  it("treats a stale 'supabase' pin like auto: ready on the platform, Convex still needs its key", () => {
    expect(() => assertOrderBackendReady(makeTenant({ order_backend: RETIRED_SUPABASE_PIN }))).not.toThrow()
    expect(() =>
      assertOrderBackendReady(
        makeTenant({ order_backend: RETIRED_SUPABASE_PIN, convex_deployment_url: 'https://tenant.convex.cloud' })
      )
    ).toThrow(/convex/i)
  })
})
