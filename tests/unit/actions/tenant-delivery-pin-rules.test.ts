/** @jest-environment node */

/**
 * The merchant's Delivery settings is where a store sets its pickup pin.
 * A Lalamove store could save no pin (7 of 25 had none) or a pin outside the
 * Philippines, and every quote then failed. The save now refuses both.
 */

jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: jest.fn().mockResolvedValue({ user: { id: 'owner-1' }, userRole: { role: 'admin' } }),
  verifyTenantPermission: jest.fn().mockResolvedValue({ user: { id: 'owner-1' }, userRole: { role: 'admin' } }),
}))

let storeRow: Record<string, unknown> = {}
let readError: unknown = null
const update = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      let isUpdate = false
      const chain = {
        update: (...args: unknown[]) => {
          isUpdate = true
          update(...args)
          return chain
        },
        select: () => chain,
        eq: () => chain,
        single: async () =>
          isUpdate
            ? { data: { id: 't1', slug: 'store' }, error: null }
            : { data: readError ? null : storeRow, error: readError },
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

const NO_DISTANCE = {
  distance_delivery_enabled: false,
  delivery_price_per_km: null,
  delivery_min_fee: null,
  delivery_radius_km: null,
  restaurant_address: 'Enverga Blvd, Lucena',
}

async function save(pin: { restaurant_latitude: number | null; restaurant_longitude: number | null }) {
  const { updateTenantDeliveryForAdminAction } = await import('@/actions/tenants')
  return updateTenantDeliveryForAdminAction('t1', { ...NO_DISTANCE, ...pin })
}

beforeEach(() => {
  update.mockClear()
  readError = null
  storeRow = { lalamove_enabled: true, lalamove_market: 'PH' }
})

describe('updateTenantDeliveryForAdminAction — pickup pin', () => {
  it('refuses a Lalamove store saving no pin', async () => {
    const result = await save({ restaurant_latitude: null, restaurant_longitude: null })
    expect(result).toEqual({ error: expect.stringContaining("Pin your store's location") })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a pin outside the Philippines', async () => {
    const result = await save({ restaurant_latitude: 22.3193, restaurant_longitude: 114.1694 })
    expect(result).toEqual({ error: expect.stringContaining('outside the Philippines') })
    expect(update).not.toHaveBeenCalled()
  })

  it('saves a Philippine pin', async () => {
    const result = await save({ restaurant_latitude: 13.9358, restaurant_longitude: 121.6129 })
    expect(result).toMatchObject({ success: true })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('lets a store without Lalamove or distance pricing save no pin', async () => {
    storeRow = { lalamove_enabled: false, lalamove_market: null }
    const result = await save({ restaurant_latitude: null, restaurant_longitude: null })
    expect(result).toMatchObject({ success: true })
  })

  it('refuses rather than guess when the store settings cannot be read', async () => {
    readError = { message: 'timeout' }
    const result = await save({ restaurant_latitude: 13.9358, restaurant_longitude: 121.6129 })
    expect(result).toEqual({ error: expect.stringContaining('try again') })
    expect(update).not.toHaveBeenCalled()
  })
})
export {}
