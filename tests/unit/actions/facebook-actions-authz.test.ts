/** @jest-environment node */

/**
 * The Facebook server actions handle the owner's Facebook tokens on the
 * service role, so they must be gated like the Facebook management API routes
 * (tests/unit/api/facebook-management-authz.test.ts): the `settings`
 * permission, not merely "any staff of the store". A POS-only staffer used to
 * be able to read the owner's long-lived Facebook user token.
 */

import { hasPermission } from '@/lib/staff-permissions'

let mockPermissions: string[] | null = []
jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: jest.fn().mockResolvedValue({ user: { id: 'staff-1' }, userRole: { role: 'admin' } }),
  verifyTenantPermission: async (_tenantId: string, permission: 'settings') => {
    if (!hasPermission({ role: 'admin', is_owner: false, permissions: mockPermissions }, permission)) {
      throw new Error('Unauthorized: Missing permission for this feature')
    }
    return { user: { id: 'staff-1' }, userRole: { role: 'admin' } }
  },
}))

const getTenantUserAccessToken = jest.fn()
const getTenantPageByPageId = jest.fn()
const getTenantActivePageById = jest.fn()
jest.mock('@/lib/facebook/page-tokens', () => ({
  getTenantUserAccessToken: (...args: unknown[]) => getTenantUserAccessToken(...args),
  getTenantPageByPageId: (...args: unknown[]) => getTenantPageByPageId(...args),
  getTenantActivePageById: (...args: unknown[]) => getTenantActivePageById(...args),
}))

const subscribePageToWebhook = jest.fn()
jest.mock('@/lib/facebook-api', () => ({
  subscribePageToWebhook: (...args: unknown[]) => subscribePageToWebhook(...args),
}))

const supabaseFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (...args: unknown[]) => supabaseFrom(...args) }),
}))

async function load() {
  return import('@/actions/facebook')
}

describe('Facebook server actions authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPermissions = ['orders', 'pos']
    getTenantUserAccessToken.mockResolvedValue('owner-user-token')
    getTenantActivePageById.mockResolvedValue({ page_id: 'p1', page_access_token: 'page-token' })
    subscribePageToWebhook.mockResolvedValue({ success: true })
  })

  it('refuses to hand the Facebook user token to staff without Settings permission', async () => {
    // Arrange
    const { getTempUserTokenAction } = await load()

    // Act
    const result = await getTempUserTokenAction('store-1', 'temp-1')

    // Assert
    expect(result).toEqual({ success: false, error: 'Unauthorized: Missing permission for this feature' })
    expect(getTenantUserAccessToken).not.toHaveBeenCalled()
  })

  it('returns the token to staff with Settings permission, read scoped to the tenant', async () => {
    // Arrange
    mockPermissions = ['settings']
    const { getTempUserTokenAction } = await load()

    // Act
    const result = await getTempUserTokenAction('store-1', 'temp-1')

    // Assert
    expect(result).toEqual({ success: true, data: { user_access_token: 'owner-user-token' } })
    expect(getTenantUserAccessToken).toHaveBeenCalledWith('store-1', 'temp-1')
  })

  it('keeps owners and legacy full-access admins working', async () => {
    // Arrange — `permissions: null` is a pre-staff-management admin.
    mockPermissions = null
    const { getTempUserTokenAction } = await load()

    // Act / Assert
    expect((await getTempUserTokenAction('store-1', 'temp-1')).success).toBe(true)
  })

  it('refuses connect, disconnect and subscribe without Settings permission', async () => {
    // Arrange
    const { connectFacebookPageAction, disconnectFacebookPageAction, subscribePageToWebhookAction } = await load()

    // Act
    const results = await Promise.all([
      connectFacebookPageAction('store-1', 'p1', 'Page', 'page-token', 'user-token', 'temp-1'),
      disconnectFacebookPageAction('store-1', 'p1'),
      subscribePageToWebhookAction('store-1', 'row-1'),
    ])

    // Assert
    for (const result of results) {
      expect(result).toEqual({ success: false, error: 'Unauthorized: Missing permission for this feature' })
    }
    expect(supabaseFrom).not.toHaveBeenCalled()
    expect(getTenantPageByPageId).not.toHaveBeenCalled()
    expect(getTenantActivePageById).not.toHaveBeenCalled()
    expect(subscribePageToWebhook).not.toHaveBeenCalled()
  })

  it('lets Settings staff resubscribe a page', async () => {
    // Arrange
    mockPermissions = ['settings']
    const { subscribePageToWebhookAction } = await load()

    // Act / Assert
    expect(await subscribePageToWebhookAction('store-1', 'row-1')).toEqual({ success: true })
    expect(getTenantActivePageById).toHaveBeenCalledWith('store-1', 'row-1')
  })
})
