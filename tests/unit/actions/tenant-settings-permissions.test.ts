/** @jest-environment node */

/**
 * The tenant settings writes in src/actions/tenants.ts must require the same
 * per-feature permission as the admin screen that calls them. They used to
 * check only "staff of this store", so a POS-only staffer could repoint
 * `messenger_username` (redirecting every order), change delivery fees, hours
 * or the pickup flow.
 *
 * Settings sections (hours, delivery, messenger, footer, splash) are gated on
 * `settings` (src/lib/settings/settings-catalog.ts); branding is `store_setup`
 * like `saveBrandingAction`.
 */

import { hasPermission } from '@/lib/staff-permissions'

let mockPermissions: string[] | null = []
jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: jest.fn().mockResolvedValue({ user: { id: 'staff-1' }, userRole: { role: 'admin' } }),
  verifyTenantPermission: async (_tenantId: string, permission: 'settings' | 'store_setup') => {
    if (!hasPermission({ role: 'admin', is_owner: false, permissions: mockPermissions }, permission)) {
      throw new Error('Unauthorized: Missing permission for this feature')
    }
    return { user: { id: 'staff-1' }, userRole: { role: 'admin' } }
  },
}))

const update = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const chain = {
        update: (...args: unknown[]) => {
          update(...args)
          return chain
        },
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: { id: 't1', slug: 'store', flash_screen_feature_enabled: true }, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
      }
      return chain
    },
  }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/tenant-secrets', () => ({ upsertTenantSecrets: jest.fn(), getTenantSecrets: jest.fn() }))
jest.mock('@/lib/convex-config-sync', () => ({ syncTenantConvexConfig: jest.fn(), convexConfigSyncWarning: jest.fn() }))
jest.mock('@/lib/cache', () => ({ invalidateTenantCache: jest.fn() }))
jest.mock('@/lib/leads/leads-service', () => ({ convertToTenant: jest.fn() }))
jest.mock('@/lib/domains/detach-tenant-domains', () => ({ detachTenantDomains: jest.fn() }))
jest.mock('@/lib/platform-staff/guard', () => ({ requirePlatformPermission: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))

type Write = (actions: typeof import('@/actions/tenants')) => Promise<unknown>

const SETTINGS_WRITES: Array<[string, Write]> = [
  ['delivery', (a) => a.updateTenantDeliveryForAdminAction('t1', {
    distance_delivery_enabled: false,
    delivery_price_per_km: null,
    delivery_min_fee: null,
    delivery_radius_km: null,
    restaurant_address: '',
    restaurant_latitude: null,
    restaurant_longitude: null,
  })],
  ['footer', (a) => a.updateTenantFooterForAdminAction('t1', {})],
  ['flash screen', (a) => a.updateTenantFlashScreenForAdminAction('t1', {
    flash_screen_is_active: false,
    flash_screen_duration_ms: 2000,
  })],
  ['messenger username', (a) => a.updateTenantMessengerUsernameAction('t1', 'attacker.page')],
  ['messenger mode', (a) => a.updateTenantMessengerModeAction('t1', 'direct')],
  ['messenger redirect', (a) => a.updateTenantMessengerRedirectEnabledAction('t1', false)],
  ['operating hours', (a) => a.updateOperatingHoursAction('t1', null)],
  ['pickup scan', (a) => a.updatePickupScanAction('t1', false)],
]

const BRANDING_WRITE: Write = (a) => a.updateTenantBrandingForAdminAction('t1', {
  primary_color: '#000000',
  secondary_color: '#ffffff',
})

async function load() {
  return import('@/actions/tenants')
}

describe('tenant settings writes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPermissions = ['orders', 'pos']
  })

  it.each(SETTINGS_WRITES)('refuses the %s write for staff without Settings permission', async (_name, write) => {
    // Act / Assert
    await expect(write(await load())).rejects.toThrow('Missing permission')
    expect(update).not.toHaveBeenCalled()
  })

  it.each(SETTINGS_WRITES)('allows the %s write for staff with Settings permission', async (_name, write) => {
    // Arrange
    mockPermissions = ['settings']

    // Act
    const result = await write(await load())

    // Assert
    expect(result).toEqual(expect.objectContaining({ success: true }))
    expect(update).toHaveBeenCalled()
  })

  it('gates the admin branding write on store_setup, like saveBrandingAction', async () => {
    // Arrange — settings alone is not branding.
    mockPermissions = ['settings']

    // Act / Assert
    await expect(BRANDING_WRITE(await load())).rejects.toThrow('Missing permission')
    expect(update).not.toHaveBeenCalled()

    mockPermissions = ['store_setup']
    expect(await BRANDING_WRITE(await load())).toEqual({ success: true })
  })

  it('keeps legacy full-access admins working', async () => {
    // Arrange — `permissions: null` is an admin created before staff management.
    mockPermissions = null

    // Act / Assert
    expect(await (await load()).updateTenantMessengerUsernameAction('t1', 'store.page'))
      .toEqual(expect.objectContaining({ success: true }))
  })
})
