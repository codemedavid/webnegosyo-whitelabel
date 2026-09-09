/**
 * @jest-environment node
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals'

/**
 * Storefront analytics events (`upsell_shown`, `bundle_added`, …) used to be
 * written ONLY to a tenant's Convex deployment. A platform-backend store has
 * none, so its events were dropped and the merchant app's Upsell and Bundle
 * sections could never show anything but zero. The action now writes them to
 * the shared `analytics_events` table for those stores.
 */

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/convex/server', () => ({
  createConvexServerClient: jest.fn(),
}))

jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: jest.fn(async () => ({ convex_deploy_key: 'deploy-key' })),
}))

const mockConvexMutation = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const mockInsert = jest.fn<(...args: unknown[]) => Promise<{ error: null }>>()
let mockTenantRow: Record<string, unknown> | null = null

function fakeAdminClient() {
  return {
    from: (table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: mockTenantRow, error: null }) }),
          }),
        }
      }
      if (table === 'analytics_events') {
        return { insert: mockInsert }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

// Mocks must be registered before the action module loads, and this runner
// does not hoist `jest.mock` above static imports — so the action and its
// mocked collaborators are imported lazily (same pattern as lalamove-actions).
async function loadAction() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { createConvexServerClient } = await import('@/lib/convex/server')
  ;(createAdminClient as unknown as jest.Mock).mockReturnValue(fakeAdminClient())
  ;(createConvexServerClient as unknown as jest.Mock).mockReturnValue({
    mutation: mockConvexMutation,
  })
  const { trackAnalyticsEventAction } = await import('@/app/actions/analytics')
  return trackAnalyticsEventAction
}

beforeEach(() => {
  mockConvexMutation.mockReset()
  mockInsert.mockReset()
  mockInsert.mockResolvedValue({ error: null })
})

describe('trackAnalyticsEventAction', () => {
  test('writes a platform-backend store event to analytics_events, scoped to the tenant', async () => {
    const trackAnalyticsEventAction = await loadAction()
    mockTenantRow = { convex_deployment_url: null, order_backend: 'platform' }

    await trackAnalyticsEventAction('tenant-1', 'upsell_shown', { source: 'inline_upgrade' })

    expect(mockInsert).toHaveBeenCalledWith({
      tenant_id: 'tenant-1',
      type: 'upsell_shown',
      metadata: { source: 'inline_upgrade' },
    })
    expect(mockConvexMutation).not.toHaveBeenCalled()
  })

  test('still sends a Convex store event to its deployment', async () => {
    const trackAnalyticsEventAction = await loadAction()
    mockTenantRow = { convex_deployment_url: 'https://x.convex.cloud', order_backend: 'convex' }

    await trackAnalyticsEventAction('tenant-1', 'upsell_clicked')

    expect(mockConvexMutation).toHaveBeenCalledWith('analytics:trackEvent', {
      type: 'upsell_clicked',
      metadata: {},
    })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  test('routes an "auto" tenant without a Convex url to the platform table', async () => {
    const trackAnalyticsEventAction = await loadAction()
    mockTenantRow = { convex_deployment_url: null, order_backend: 'auto' }

    await trackAnalyticsEventAction('tenant-1', 'bundle_viewed')

    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  test('drops a malformed event type instead of storing junk', async () => {
    const trackAnalyticsEventAction = await loadAction()
    mockTenantRow = { convex_deployment_url: null, order_backend: 'platform' }

    await trackAnalyticsEventAction('tenant-1', '', {})
    await trackAnalyticsEventAction('tenant-1', 'x'.repeat(200), {})

    expect(mockInsert).not.toHaveBeenCalled()
  })

  test('never throws to the storefront when the write fails', async () => {
    const trackAnalyticsEventAction = await loadAction()
    mockTenantRow = { convex_deployment_url: null, order_backend: 'platform' }
    mockInsert.mockRejectedValueOnce(new Error('boom'))

    await expect(trackAnalyticsEventAction('tenant-1', 'upsell_shown')).resolves.toBeUndefined()
  })
})
