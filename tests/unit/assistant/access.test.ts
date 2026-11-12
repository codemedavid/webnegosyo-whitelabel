/** @jest-environment node */
/**
 * Who may open Owl at all (owner's call, 2026-11-12): owners and superadmins
 * always; a staff account only once the owner ticks "Use the Owl assistant"
 * (`assistant`, opt-in — a legacy full-access account does NOT hold it).
 * The refusal happens before the tenant row is read.
 */

jest.mock('server-only', () => ({}))

const mockVerify = jest.fn()
jest.mock('@/lib/admin-service', () => ({ verifyTenantAdmin: (...args: unknown[]) => mockVerify(...args) }))

const mockTenantRead = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mockTenantRead() }) }) }),
  }),
}))

import { NO_ASSISTANT_GRANT, resolveAssistantAccess } from '@/lib/assistant/access'

const TENANT = '11111111-1111-4111-8111-111111111111'

function signedInAs(userRole: Record<string, unknown>) {
  mockVerify.mockResolvedValue({ user: { id: 'user-1' }, userRole: { role: 'admin', tenant_id: TENANT, outlet_id: null, ...userRole } })
}

beforeEach(() => {
  mockVerify.mockReset()
  mockTenantRead.mockReset()
  mockTenantRead.mockResolvedValue({
    data: { id: TENANT, slug: 'demo', name: 'Demo', assistant_enabled: true, inventory_enabled: true, menu_engineering_enabled: false, customer_hub_enabled: false, order_backend: 'platform', convex_deployment_url: null },
    error: null,
  })
})

describe('resolveAssistantAccess — the owner chooses who uses Owl', () => {
  test('an owner always may', async () => {
    signedInAs({ is_owner: true, permissions: null })
    const access = await resolveAssistantAccess(TENANT)
    expect(access.ok).toBe(true)
  })

  test('a legacy full-access staff account (permissions: null) may NOT — the key is opt-in', async () => {
    signedInAs({ is_owner: false, permissions: null })
    const access = await resolveAssistantAccess(TENANT)
    expect(access).toEqual({ ok: false, status: 403, error: NO_ASSISTANT_GRANT })
    expect(mockTenantRead).not.toHaveBeenCalled()
  })

  test('a staff account with other keys but not `assistant` may not', async () => {
    signedInAs({ is_owner: false, permissions: ['orders', 'menu', 'reports', 'inventory'] })
    const access = await resolveAssistantAccess(TENANT)
    expect(access.ok).toBe(false)
  })

  test('a staff account the owner ticked may, and keeps only its own keys for the tools', async () => {
    signedInAs({ is_owner: false, permissions: ['assistant', 'inventory'] })
    const access = await resolveAssistantAccess(TENANT)
    expect(access.ok).toBe(true)
    if (access.ok) expect(access.caller.permissions).toEqual(['assistant', 'inventory'])
  })

  test('the store switch still applies to everyone', async () => {
    signedInAs({ is_owner: true, permissions: null })
    mockTenantRead.mockResolvedValue({ data: { id: TENANT, slug: 'demo', name: 'Demo', assistant_enabled: false }, error: null })
    const access = await resolveAssistantAccess(TENANT)
    expect(access).toMatchObject({ ok: false, status: 403 })
  })
})
