/**
 * Which backend hears about a cutoff change: the one that numbers the store's
 * orders. The schedule is always re-read from the platform (fail closed).
 */
export {}

const TENANT = '11111111-1111-4111-8111-111111111111'
const mockRouting = jest.fn()
const mockConvexSync = jest.fn()
const mockReadSchedule = jest.fn()
const mockWrite = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: () => mockRouting() }) }) }),
  }),
}))
jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: async () => null,
  mergeTenantSecrets: (tenant: object) => tenant,
}))
jest.mock('@/lib/convex-config-sync', () => ({ syncTenantConvexConfig: (...args: unknown[]) => mockConvexSync(...args) }))
jest.mock('@/lib/business-day/read-schedule', () => ({ readCutoffSchedule: (...args: unknown[]) => mockReadSchedule(...args) }))
jest.mock('@/lib/business-day/tenant-db-sync', () => ({ writeCutoffsToTenantDb: (...args: unknown[]) => mockWrite(...args) }))
jest.mock('@/lib/supabase/tenant-order-client', () => ({ createTenantOrderWriteClient: () => ({ kind: 'tenant-db' }) }))

const OWN_DB = {
  id: TENANT,
  order_backend: 'supabase',
  supabase_order_url: 'https://own.supabase.co',
  supabase_order_anon_key: 'anon',
  supabase_order_service_key: 'service',
}
const FOUR_AM = [{ effectiveFrom: '2026-10-28', cutoffMinutes: 240 }]

async function load() {
  return import('@/lib/business-day/order-backend-sync')
}

beforeEach(() => {
  jest.clearAllMocks()
  mockConvexSync.mockResolvedValue({ status: 'synced' })
  mockReadSchedule.mockResolvedValue(FOUR_AM)
  mockWrite.mockResolvedValue(undefined)
})

describe('syncBusinessDayToOrderBackend', () => {
  it("copies the stored schedule into a store's own order database", async () => {
    mockRouting.mockResolvedValue({ data: OWN_DB, error: null })
    const { syncBusinessDayToOrderBackend } = await load()
    await expect(syncBusinessDayToOrderBackend(TENANT)).resolves.toEqual({ status: 'synced' })
    expect(mockWrite).toHaveBeenCalledWith({ kind: 'tenant-db' }, TENANT, FOUR_AM)
    expect(mockConvexSync).not.toHaveBeenCalled()
  })

  it("pushes a Convex store's config (which carries the schedule)", async () => {
    mockRouting.mockResolvedValue({ data: { id: TENANT, order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' }, error: null })
    const { syncBusinessDayToOrderBackend } = await load()
    await expect(syncBusinessDayToOrderBackend(TENANT)).resolves.toEqual({ status: 'synced' })
    expect(mockConvexSync).toHaveBeenCalledWith(TENANT)
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('leaves a platform store to the config sync, which skips stores without a deployment', async () => {
    mockRouting.mockResolvedValue({ data: { id: TENANT, order_backend: 'platform' }, error: null })
    mockConvexSync.mockResolvedValue({ status: 'skipped', reason: 'No Convex deployment URL' })
    const { syncBusinessDayToOrderBackend } = await load()
    await expect(syncBusinessDayToOrderBackend(TENANT)).resolves.toEqual({ status: 'skipped', reason: 'No Convex deployment URL' })
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('reports, never pushes, when the schedule cannot be read', async () => {
    mockRouting.mockResolvedValue({ data: OWN_DB, error: null })
    mockReadSchedule.mockRejectedValue(new Error("Couldn't load the store's business day setting"))
    const { syncBusinessDayToOrderBackend } = await load()
    await expect(syncBusinessDayToOrderBackend(TENANT)).resolves.toMatchObject({ status: 'failed' })
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('reports a store it cannot load', async () => {
    mockRouting.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const { syncBusinessDayToOrderBackend } = await load()
    await expect(syncBusinessDayToOrderBackend(TENANT)).resolves.toEqual({ status: 'failed', error: 'not found' })
  })
})
