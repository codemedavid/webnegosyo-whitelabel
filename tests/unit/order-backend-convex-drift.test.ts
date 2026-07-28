import { describe, it, expect } from '@jest/globals'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'

/**
 * Regression tests for the "Coffee Mode" bug.
 *
 * A tenant with a working Convex deployment kept the `order_backend` column
 * default because nothing in the tenant create/update path ever wrote that
 * column — only the one-off backfill migration did, and these tenants were
 * created after it ran. Checkout (`src/app/actions/orders.ts`) routes on the
 * presence of Convex credentials, so orders went to Convex, while the web admin
 * routed on `resolveOrderBackend` and therefore read the empty shared platform
 * database and rendered the "requires Convex setup" banner. The orders were
 * never lost, just invisible to the merchant on the web.
 *
 * The fix has two halves: every write path now stamps the column, and the
 * column default is `auto` (derive from credentials) rather than a `platform`
 * that reads as a deliberate choice. These tests pin the second half — an
 * unwritten or legacy column must never point reads away from Convex.
 *
 * Deliberate pins are covered in `order-backend-preference.test.ts`.
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

describe('resolveOrderBackend — a tenant nobody routed by hand', () => {
  it('routes reads to convex when the column was never written', () => {
    // Arrange — the Coffee Mode row as it would be created today.
    const tenant = makeTenant({ order_backend: null, ...CONVEX_CREDS })

    // Act
    const backend = resolveOrderBackend(tenant)

    // Assert — the web admin must look where checkout actually wrote.
    expect(backend).toBe('convex')
  })

  it('routes reads to convex when the column holds the auto default', () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: 'auto', ...CONVEX_CREDS }))).toBe(
      'convex'
    )
  })

  it('never resolves to platform for an unrouted convex tenant', () => {
    // The checkout write path routes to Convex whenever the resolver says so,
    // so "platform" here would mean reads and writes disagree.
    expect(resolveOrderBackend(makeTenant({ order_backend: 'auto', ...CONVEX_CREDS }))).not.toBe(
      'platform'
    )
    expect(resolveOrderBackend(makeTenant(CONVEX_CREDS))).not.toBe('platform')
  })

  it('still resolves to platform for an unrouted tenant with no convex url', () => {
    expect(resolveOrderBackend(makeTenant({ order_backend: 'auto' }))).toBe('platform')
    expect(resolveOrderBackend(makeTenant())).toBe('platform')
  })
})
