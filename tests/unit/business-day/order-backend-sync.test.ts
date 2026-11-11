/**
 * Which backend hears about a cutoff change: the one that numbers the store's
 * orders. The schedule is always re-read from the platform (fail closed).
 */
export {}

const TENANT = '11111111-1111-4111-8111-111111111111'
const mockRouting = jest.fn()
const mockConvexSync = jest.fn()

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

async function load() {
  return import('@/lib/business-day/order-backend-sync')
}

beforeEach(() => {
  jest.clearAllMocks()
  mockConvexSync.mockResolvedValue({ status: 'synced' })
})

describe('syncBusinessDayToOrderBackend', () => {
  it("pushes a Convex store's config (which carries the schedule)", async () => {
    mockRouting.mockResolvedValue({ data: { id: TENANT, order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' }, error: null })
    const { syncBusinessDayToOrderBackend } = await load()
    await expect(syncBusinessDayToOrderBackend(TENANT)).resolves.toEqual({ status: 'synced' })
    expect(mockConvexSync).toHaveBeenCalledWith(TENANT)
  })

  it('skips a platform store, never writing to a Convex deployment left over on it', async () => {
    mockRouting.mockResolvedValue({
      data: { id: TENANT, order_backend: 'platform', convex_deployment_url: 'https://old-store.convex.cloud' },
      error: null,
    })
    const { syncBusinessDayToOrderBackend } = await load()
    await expect(syncBusinessDayToOrderBackend(TENANT)).resolves.toMatchObject({ status: 'skipped' })
    expect(mockConvexSync).not.toHaveBeenCalled()
  })

  it("routes a stale 'supabase' pin (the retired own-database backend) like auto", async () => {
    // No Convex URL: the shared platform database, which reads the cutoff itself.
    mockRouting.mockResolvedValue({ data: { id: TENANT, order_backend: 'supabase', convex_deployment_url: null }, error: null })
    const { syncBusinessDayToOrderBackend } = await load()
    await expect(syncBusinessDayToOrderBackend(TENANT)).resolves.toMatchObject({ status: 'skipped' })
    expect(mockConvexSync).not.toHaveBeenCalled()
  })

  it('reports a store it cannot load', async () => {
    mockRouting.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const { syncBusinessDayToOrderBackend } = await load()
    await expect(syncBusinessDayToOrderBackend(TENANT)).resolves.toEqual({ status: 'failed', error: 'not found' })
  })
})
