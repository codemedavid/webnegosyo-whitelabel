/** @jest-environment node */

/**
 * The server's own read of an order's status and customer_data, routed by
 * `resolveOrderBackend`. Cancel side effects (stock restore, presell release)
 * trust THIS read instead of anything the browser sends.
 */

let tenantRow: Record<string, unknown> | null = null
let platformOrder: Record<string, unknown> | null = null
const ordersEq = jest.fn()

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (...args: unknown[]) => {
          if (table === 'orders') ordersEq(...args)
          return chain
        },
        maybeSingle: async () => ({
          data: table === 'tenants' ? tenantRow : platformOrder,
          error: null,
        }),
      }
      return chain
    },
  }),
}))

const getTenantSecrets = jest.fn()
jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: (...args: unknown[]) => getTenantSecrets(...args),
}))

const convexQuery = jest.fn()
jest.mock('@/lib/convex/server', () => ({
  createConvexServerClient: () => ({ query: (...args: unknown[]) => convexQuery(...args) }),
}))

const fetchTenantOrderById = jest.fn()
jest.mock('@/lib/tenant-supabase-orders-read', () => ({
  fetchTenantOrderById: (...args: unknown[]) => fetchTenantOrderById(...args),
}))
jest.mock('@/lib/supabase/tenant-order-client', () => ({
  createTenantOrderRealtimeClient: () => ({ tenantClient: true }),
}))

async function load() {
  return import('@/lib/order-lifecycle-read')
}

describe('readStoredOrderLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    tenantRow = null
    platformOrder = null
  })

  it('reads a platform tenant order from the platform orders table, scoped to the tenant', async () => {
    // Arrange
    tenantRow = { order_backend: 'platform', convex_deployment_url: 'https://stale.convex.cloud' }
    platformOrder = { status: 'cancelled', customer_data: { presell_claim: 'x' } }
    const { readStoredOrderLifecycle } = await load()

    // Act
    const order = await readStoredOrderLifecycle('t1', 'order-1')

    // Assert — a leftover Convex URL must not send the read to Convex.
    expect(order).toEqual({ status: 'cancelled', customerData: { presell_claim: 'x' } })
    expect(ordersEq).toHaveBeenCalledWith('tenant_id', 't1')
    expect(convexQuery).not.toHaveBeenCalled()
  })

  it('reads a Convex tenant order through the deployment with the deploy key', async () => {
    // Arrange
    tenantRow = { order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' }
    getTenantSecrets.mockResolvedValue({ convex_deploy_key: 'key' })
    convexQuery.mockResolvedValue({ status: 'cancelled', customerData: { a: 1 } })
    const { readStoredOrderLifecycle } = await load()

    // Act
    const order = await readStoredOrderLifecycle('t1', 'jh7abc')

    // Assert
    expect(convexQuery).toHaveBeenCalledWith('orders:getOrderByIdInternal', { orderId: 'jh7abc' })
    expect(order).toEqual({ status: 'cancelled', customerData: { a: 1 } })
  })

  it('answers null for a Convex tenant without a deploy key rather than guessing', async () => {
    // Arrange
    tenantRow = { order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' }
    getTenantSecrets.mockResolvedValue(null)
    const { readStoredOrderLifecycle } = await load()

    // Act / Assert
    await expect(readStoredOrderLifecycle('t1', 'jh7abc')).resolves.toBeNull()
  })

  it('reads a tenant-Supabase order from the tenant project', async () => {
    // Arrange
    tenantRow = { order_backend: 'supabase', supabase_order_url: 'https://t.supabase.co', supabase_order_anon_key: 'anon' }
    fetchTenantOrderById.mockResolvedValue({ status: 'pending', customer_data: null })
    const { readStoredOrderLifecycle } = await load()

    // Act
    const order = await readStoredOrderLifecycle('t1', 'order-1')

    // Assert
    expect(fetchTenantOrderById).toHaveBeenCalledWith({ tenantClient: true }, 't1', 'order-1')
    expect(order).toEqual({ status: 'pending', customerData: null })
  })

  it('answers null for an unknown tenant or a missing order', async () => {
    const { readStoredOrderLifecycle } = await load()
    await expect(readStoredOrderLifecycle('t1', 'order-1')).resolves.toBeNull()

    tenantRow = { order_backend: 'platform' }
    await expect(readStoredOrderLifecycle('t1', 'order-1')).resolves.toBeNull()
  })
})

// A module, so its top-level mocks do not collide with other test files.
export {}
