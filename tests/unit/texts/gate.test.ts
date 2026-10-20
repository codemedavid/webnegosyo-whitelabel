/** @jest-environment node */
/**
 * Who may open /admin/texts: a store admin with the `customers` permission,
 * store-wide (texts reach every guest of the store, so a branch account is
 * refused). Owners and superadmins are "owner" for disconnecting a phone.
 */

// A module (not a script), so these test-file constants stay file-scoped.
export {}

const verifyTenantPermission = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: unknown[]) => verifyTenantPermission(...args),
}))

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'

function caller(userRole: Record<string, unknown>) {
  verifyTenantPermission.mockResolvedValue({ user: { id: 'user-1' }, userRole: { tenant_id: TENANT, ...userRole } })
}

async function gate(action?: 'view' | 'edit') {
  const { requireTextsAccess } = await import('@/lib/texts/gate')
  return requireTextsAccess(TENANT, action)
}

beforeEach(() => jest.clearAllMocks())

describe('requireTextsAccess', () => {
  it('asks for the customers permission (edit by default)', async () => {
    caller({ role: 'admin', is_owner: true })
    await gate()
    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'customers', 'edit')
  })

  it('passes a read-only verb through for page loads', async () => {
    caller({ role: 'admin', is_owner: true })
    await gate('view')
    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'customers', 'view')
  })

  it('lets the owner in as owner', async () => {
    caller({ role: 'admin', is_owner: true })
    expect(await gate()).toEqual({ userId: 'user-1', isOwner: true })
  })

  it('counts a superadmin as owner', async () => {
    caller({ role: 'superadmin', tenant_id: null })
    expect(await gate()).toEqual({ userId: 'user-1', isOwner: true })
  })

  it('lets store-wide staff in, not as owner', async () => {
    caller({ role: 'admin', is_owner: false, permissions: ['customers'], outlet_id: null })
    expect(await gate()).toEqual({ userId: 'user-1', isOwner: false })
  })

  it('refuses a branch-locked account', async () => {
    caller({ role: 'admin', is_owner: false, permissions: ['customers'], outlet_id: 'branch-1' })
    await expect(gate()).rejects.toThrow(/whole store/)
  })

  it('refuses when the permission check refuses', async () => {
    verifyTenantPermission.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
    await expect(gate()).rejects.toThrow(/Missing permission/)
  })
})
