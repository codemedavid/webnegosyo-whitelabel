/** @jest-environment node */

/**
 * `releasePresellForCancelledConvexOrderAction` gives a cancelled order's
 * presell dates back via `apply_presell_order('void')` on the service role.
 * It used to need no login and took the presell lines from the browser, so
 * anyone could zero any store's sold_qty. It now requires the `orders`
 * permission and releases only what the stored, cancelled order claimed.
 */

const verifyTenantPermission = jest.fn()
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: unknown[]) => verifyTenantPermission(...args),
}))

const readStoredOrderLifecycle = jest.fn()
jest.mock('@/lib/order-lifecycle-read', () => ({
  readStoredOrderLifecycle: (...args: unknown[]) => readStoredOrderLifecycle(...args),
  isCancelledOrder: (order: { status?: string } | null) => order?.status === 'cancelled',
}))

const releasePresellForCancelledConvexOrder = jest.fn()
jest.mock('@/lib/presell/convex-cancel', () => ({
  releasePresellForCancelledConvexOrder: (...args: unknown[]) =>
    releasePresellForCancelledConvexOrder(...args),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/storefront/revalidate', () => ({ revalidateStorefrontMenu: jest.fn() }))

const STORED_CUSTOMER_DATA = { presell_claim: { claimId: 'stored-claim', lines: [] } }

async function release(tenantId: string, orderId: string) {
  const { releasePresellForCancelledConvexOrderAction } = await import('@/app/actions/presell')
  return releasePresellForCancelledConvexOrderAction(tenantId, orderId)
}

describe('releasePresellForCancelledConvexOrderAction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    verifyTenantPermission.mockResolvedValue({ user: { id: 'staff-1' } })
    readStoredOrderLifecycle.mockResolvedValue({ status: 'cancelled', customerData: STORED_CUSTOMER_DATA })
  })

  it('refuses a caller without the orders permission before any read or release', async () => {
    // Arrange
    verifyTenantPermission.mockRejectedValue(new Error('Unauthorized: Not authenticated'))

    // Act
    const result = await release('t1', 'jh7order')

    // Assert
    expect(result.success).toBe(false)
    expect(verifyTenantPermission).toHaveBeenCalledWith('t1', 'orders')
    expect(readStoredOrderLifecycle).not.toHaveBeenCalled()
    expect(releasePresellForCancelledConvexOrder).not.toHaveBeenCalled()
  })

  it('releases the claim stored on the cancelled order, not anything from the browser', async () => {
    // Act
    const result = await release('t1', 'jh7order')

    // Assert
    expect(result).toEqual({ success: true })
    expect(readStoredOrderLifecycle).toHaveBeenCalledWith('t1', 'jh7order')
    expect(releasePresellForCancelledConvexOrder).toHaveBeenCalledWith('t1', STORED_CUSTOMER_DATA)
  })

  it.each([
    ['a live order', { status: 'pending', customerData: STORED_CUSTOMER_DATA }],
    ['an order the server cannot find', null],
  ])('refuses to release presell stock for %s', async (_name, order) => {
    // Arrange
    readStoredOrderLifecycle.mockResolvedValue(order)

    // Act
    const result = await release('t1', 'jh7order')

    // Assert
    expect(result.success).toBe(false)
    expect(releasePresellForCancelledConvexOrder).not.toHaveBeenCalled()
  })
})

// A module, so its top-level mocks do not collide with other test files.
export {}
