import { describe, it, expect } from '@jest/globals'
import {
  resolveOrderBackend,
  hasTenantSupabaseOrderCredentials,
  assertOrderBackendReady,
  supabaseOrderCredentialsSchema,
  type OrderBackendTenantFields,
} from '@/lib/order-backend'

function makeTenant(
  overrides: Partial<OrderBackendTenantFields> = {}
): OrderBackendTenantFields {
  return {
    order_backend: null,
    convex_deployment_url: null,
    convex_deploy_key: null,
    supabase_order_url: null,
    supabase_order_anon_key: null,
    supabase_order_service_key: null,
    supabase_order_db_url: null,
    ...overrides,
  }
}

const VALID_SUPABASE_CREDS = {
  supabase_order_url: 'https://abcdefgh.supabase.co',
  supabase_order_anon_key: 'anon-key-123',
  supabase_order_service_key: 'service-role-key-456',
  supabase_order_db_url: 'postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres',
}

describe('resolveOrderBackend', () => {
  it('honors an explicit convex selection', () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: 'convex' }))).toBe('convex')
  })

  it('honors an explicit supabase selection', () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: 'supabase' }))).toBe('supabase')
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

describe('hasTenantSupabaseOrderCredentials', () => {
  it('is true when url, anon key and service key are all present', () => {
    expect(hasTenantSupabaseOrderCredentials(makeTenant(VALID_SUPABASE_CREDS))).toBe(true)
  })

  it('is false when the service key is missing', () => {
    const tenant = makeTenant({ ...VALID_SUPABASE_CREDS, supabase_order_service_key: null })
    expect(hasTenantSupabaseOrderCredentials(tenant)).toBe(false)
  })

  it('is false when a credential is an empty/whitespace string', () => {
    const tenant = makeTenant({ ...VALID_SUPABASE_CREDS, supabase_order_url: '   ' })
    expect(hasTenantSupabaseOrderCredentials(tenant)).toBe(false)
  })

  it('is false for a bare tenant with no credentials', () => {
    expect(hasTenantSupabaseOrderCredentials(makeTenant())).toBe(false)
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

  it('does not throw when supabase is selected and supabase creds exist', () => {
    const tenant = makeTenant({ order_backend: 'supabase', ...VALID_SUPABASE_CREDS })
    expect(() => assertOrderBackendReady(tenant)).not.toThrow()
  })

  it('throws loudly when supabase is selected but creds are missing', () => {
    expect(() => assertOrderBackendReady(makeTenant({ order_backend: 'supabase' }))).toThrow(
      /supabase/i
    )
  })
})

describe('supabaseOrderCredentialsSchema', () => {
  it('accepts a complete, valid credential set', () => {
    const parsed = supabaseOrderCredentialsSchema.parse(VALID_SUPABASE_CREDS)
    expect(parsed.supabase_order_url).toBe(VALID_SUPABASE_CREDS.supabase_order_url)
  })

  it('rejects a non-https project url', () => {
    expect(() =>
      supabaseOrderCredentialsSchema.parse({
        ...VALID_SUPABASE_CREDS,
        supabase_order_url: 'http://insecure.supabase.co',
      })
    ).toThrow()
  })

  it('rejects a db url that is not a postgres connection string', () => {
    expect(() =>
      supabaseOrderCredentialsSchema.parse({
        ...VALID_SUPABASE_CREDS,
        supabase_order_db_url: 'mysql://nope',
      })
    ).toThrow()
  })

  it('rejects an empty anon key', () => {
    expect(() =>
      supabaseOrderCredentialsSchema.parse({ ...VALID_SUPABASE_CREDS, supabase_order_anon_key: '' })
    ).toThrow()
  })
})
