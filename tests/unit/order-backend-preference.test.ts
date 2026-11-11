import { describe, it, expect } from '@jest/globals'
import {
  resolveOrderBackend,
  orderBackendForSave,
  orderBackendPreferenceOf,
  ORDER_BACKEND_PREFERENCES,
  type OrderBackendTenantFields,
} from '@/lib/order-backend'

/**
 * The superadmin tenant form can pin a tenant's order backend to Platform or
 * Convex. The default is `auto`: use Convex when a deployment is configured,
 * otherwise the shared platform database.
 *
 * `auto` — not `platform` — is the stored default precisely because the column
 * default is what stranded Coffee Mode's orders: a tenant given Convex kept the
 * `platform` default, so writes went to Convex while reads went to the empty
 * platform DB. With `auto` as the default, an unwritten column can never point
 * reads somewhere writes did not go.
 */

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

const CONVEX_CREDS = {
  convex_deployment_url: 'https://robust-bass-874.convex.cloud',
  convex_deploy_key: 'deploy-key',
}

/** The retired own-project backend; the column's CHECK still allows the word. */
const RETIRED_SUPABASE_PIN = 'supabase' as unknown as OrderBackendTenantFields['order_backend']

describe('ORDER_BACKEND_PREFERENCES', () => {
  it('offers auto, platform and convex as selectable options', () => {
    expect(ORDER_BACKEND_PREFERENCES).toEqual(['auto', 'platform', 'convex'])
  })
})

describe('resolveOrderBackend — auto (the default)', () => {
  it('uses convex when a deployment is configured', () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: 'auto', ...CONVEX_CREDS }))).toBe(
      'convex'
    )
  })

  it('uses the platform database when no deployment is configured', () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: 'auto' }))).toBe('platform')
  })

  it('treats an unset column the same as auto', () => {
    expect(resolveOrderBackend(makeTenant(CONVEX_CREDS))).toBe('convex')
    expect(resolveOrderBackend(makeTenant())).toBe('platform')
  })

  it('treats an unrecognized column value the same as auto', () => {
    const tenant = makeTenant({
      order_backend: 'mysql' as unknown as OrderBackendTenantFields['order_backend'],
      ...CONVEX_CREDS,
    })
    expect(resolveOrderBackend(tenant)).toBe('convex')
  })
})

describe('resolveOrderBackend — pinned selections', () => {
  it('honors a deliberate platform pin even though convex is configured', () => {
    const tenant = makeTenant({ order_backend: 'platform', ...CONVEX_CREDS })
    expect(resolveOrderBackend(tenant)).toBe('platform')
  })

  it('honors a deliberate convex pin', () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: 'convex', ...CONVEX_CREDS }))).toBe(
      'convex'
    )
  })

  it("does not honor a stale 'supabase' pin: it derives from the credentials like auto", () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: RETIRED_SUPABASE_PIN, ...CONVEX_CREDS }))).toBe('convex')
    expect(resolveOrderBackend(makeTenant({ order_backend: RETIRED_SUPABASE_PIN }))).toBe('platform')
  })
})

describe('orderBackendPreferenceOf — what the form shows', () => {
  it('reports auto for an unset column', () => {
    expect(orderBackendPreferenceOf(makeTenant())).toBe('auto')
  })

  it('reports the stored pin when one is set', () => {
    expect(orderBackendPreferenceOf(makeTenant({ order_backend: 'platform' }))).toBe('platform')
    expect(orderBackendPreferenceOf(makeTenant({ order_backend: 'convex' }))).toBe('convex')
  })

  it("reports auto for a stale 'supabase' pin, which is how it routes", () => {
    expect(orderBackendPreferenceOf(makeTenant({ order_backend: RETIRED_SUPABASE_PIN }))).toBe('auto')
  })
})

describe('orderBackendForSave', () => {
  it('stores auto when the superadmin leaves the default', () => {
    expect(orderBackendForSave('auto', makeTenant(CONVEX_CREDS))).toBe('auto')
  })

  it('stores auto when no preference is supplied at all', () => {
    expect(orderBackendForSave(undefined, makeTenant(CONVEX_CREDS))).toBe('auto')
  })

  it('stores a deliberate platform pin', () => {
    expect(orderBackendForSave('platform', makeTenant(CONVEX_CREDS))).toBe('platform')
  })

  it('stores a deliberate convex pin when a deployment url is present', () => {
    expect(orderBackendForSave('convex', makeTenant(CONVEX_CREDS))).toBe('convex')
  })

  it('downgrades a convex pin to auto when there is no deployment url to pin to', () => {
    expect(orderBackendForSave('convex', makeTenant())).toBe('auto')
  })

  it("never writes the retired 'supabase' value back: a save stores what the form chose", () => {
    const tenant = makeTenant({ order_backend: RETIRED_SUPABASE_PIN, ...CONVEX_CREDS })
    expect(orderBackendForSave('platform', tenant)).toBe('platform')
    expect(orderBackendForSave('convex', tenant)).toBe('convex')
    expect(orderBackendForSave('auto', tenant)).toBe('auto')
    expect(orderBackendForSave(undefined, makeTenant({ order_backend: RETIRED_SUPABASE_PIN }))).toBe('auto')
  })
})

describe('regression — orders can never be written and read in different places', () => {
  it.each([
    ['auto', 'convex'],
    [undefined, 'convex'],
    ['convex', 'convex'],
    ['platform', 'platform'],
  ] as const)(
    'preference %s on a convex-configured tenant resolves to %s after a save round-trip',
    (preference, expected) => {
      const fields = makeTenant(CONVEX_CREDS)
      const stored = orderBackendForSave(preference, fields)
      expect(resolveOrderBackend({ ...fields, order_backend: stored })).toBe(expected)
    }
  )
})
