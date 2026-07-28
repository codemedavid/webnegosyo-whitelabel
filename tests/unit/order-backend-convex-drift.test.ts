import { describe, it, expect } from '@jest/globals'
import {
  resolveOrderBackend,
  orderBackendForSave,
  type OrderBackendTenantFields,
} from '@/lib/order-backend'

/**
 * Regression tests for the "Coffee Mode" bug.
 *
 * A tenant with a working Convex deployment kept `order_backend = 'platform'`
 * because nothing in the tenant create/update path ever writes that column —
 * only the one-off backfill migration did, and these tenants were created after
 * it ran. Checkout (`src/app/actions/orders.ts`) routes on the presence of
 * Convex credentials, so orders went to Convex, while the web admin routed on
 * `resolveOrderBackend` and therefore read the empty shared platform database
 * and rendered the "requires Convex setup" banner. The orders were never lost,
 * just invisible to the merchant on the web.
 */

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

const CONVEX_CREDS = {
  convex_deployment_url: 'https://robust-bass-874.convex.cloud',
  convex_deploy_key: 'deploy-key',
}

const SUPABASE_CREDS = {
  supabase_order_url: 'https://abcdefgh.supabase.co',
  supabase_order_anon_key: 'anon-key-123',
  supabase_order_service_key: 'service-role-key-456',
}

describe('resolveOrderBackend — stale platform column with live Convex credentials', () => {
  it('routes reads to convex when the column still says platform but convex is configured', () => {
    // Arrange — exactly the Coffee Mode row: created after the backfill ran.
    const tenant = makeTenant({ order_backend: 'platform', ...CONVEX_CREDS })

    // Act
    const backend = resolveOrderBackend(tenant)

    // Assert — the web admin must look where checkout actually wrote.
    expect(backend).toBe('convex')
  })

  it('never resolves to platform while convex credentials are present', () => {
    // The checkout write path routes to Convex whenever url + deploy key exist,
    // so any resolution of "platform" here means reads and writes disagree.
    const tenant = makeTenant({ order_backend: 'platform', ...CONVEX_CREDS })
    expect(resolveOrderBackend(tenant)).not.toBe('platform')
  })

  it('still resolves to platform for a tenant with no convex url', () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: 'platform' }))).toBe('platform')
  })

  it('keeps an explicit supabase selection even if a stale convex url lingers', () => {
    const tenant = makeTenant({
      order_backend: 'supabase',
      ...SUPABASE_CREDS,
      ...CONVEX_CREDS,
    })
    expect(resolveOrderBackend(tenant)).toBe('supabase')
  })
})

describe('orderBackendForSave', () => {
  it('stamps convex when the tenant form saves a convex deployment url', () => {
    expect(orderBackendForSave(makeTenant(CONVEX_CREDS))).toBe('convex')
  })

  it('stamps platform for a tenant saved with no per-tenant backend', () => {
    expect(orderBackendForSave(makeTenant())).toBe('platform')
  })

  it('preserves an explicit supabase selection on save', () => {
    expect(orderBackendForSave(makeTenant({ order_backend: 'supabase', ...SUPABASE_CREDS }))).toBe(
      'supabase'
    )
  })

  it('rewrites a stale platform column to convex on the next save', () => {
    expect(orderBackendForSave(makeTenant({ order_backend: 'platform', ...CONVEX_CREDS }))).toBe(
      'convex'
    )
  })

  it('falls back to platform when the convex url is cleared out', () => {
    const tenant = makeTenant({ order_backend: 'convex', convex_deployment_url: '' })
    expect(orderBackendForSave(tenant)).toBe('platform')
  })
})
