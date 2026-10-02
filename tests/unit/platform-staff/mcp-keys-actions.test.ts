import { describe, it, expect, jest, beforeEach } from '@jest/globals'

/**
 * A platform MCP key acts as an authorized superadmin (the MCP surface writes
 * through the service role and can create store owners), so minting one must
 * require a full superadmin — no console grant may unlock it. Listing and
 * revoking stay grant-gated: neither hands out superadmin power.
 */

const requireFullSuperadmin = jest.fn<() => Promise<unknown>>()
const requirePlatformPermission = jest.fn<(permission: string) => Promise<unknown>>()
const createMcpKey = jest.fn<(...args: unknown[]) => Promise<unknown>>()

jest.mock('@/lib/platform-staff/guard', () => ({
  requireFullSuperadmin: () => requireFullSuperadmin(),
  requirePlatformPermission: (permission: string) => requirePlatformPermission(permission),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/mcp-keys-service', () => ({
  listMcpKeys: jest.fn(),
  createMcpKey: (...args: unknown[]) => createMcpKey(...args),
  revokeMcpKey: jest.fn(),
}))

const CALLER = { user: { id: 'user-1' }, appUser: { role: 'superadmin' } }

// next/jest does not hoist jest.mock above static imports — load lazily.
async function loadActions() {
  return import('@/app/actions/mcp-keys')
}

describe('createMcpKeyAction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('refuses platform staff even when they hold every console grant', async () => {
    // Arrange
    requirePlatformPermission.mockResolvedValue(CALLER)
    requireFullSuperadmin.mockRejectedValue(new Error('Forbidden: Superadmin access required'))
    const { createMcpKeyAction } = await loadActions()

    // Act
    const attempt = createMcpKeyAction('Staff laptop')

    // Assert
    await expect(attempt).rejects.toThrow(/Superadmin access required/)
    expect(createMcpKey).not.toHaveBeenCalled()
  })

  it('mints the key for a full superadmin, attributed to them', async () => {
    // Arrange
    requireFullSuperadmin.mockResolvedValue(CALLER)
    createMcpKey.mockResolvedValue({ key: { id: 'k1' }, plaintext: 'wnmcp_x' })
    const { createMcpKeyAction } = await loadActions()

    // Act
    const created = await createMcpKeyAction('  Ops laptop ')

    // Assert
    expect(created).toEqual({ key: { id: 'k1' }, plaintext: 'wnmcp_x' })
    expect(createMcpKey).toHaveBeenCalledWith({}, 'Ops laptop', 'user-1')
    expect(requirePlatformPermission).not.toHaveBeenCalled()
  })
})
