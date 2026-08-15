/**
 * DEFECT A wiring — the platform status change is where un-cancel happens.
 *
 * `updateOrderStatus` restored stock on →cancelled but did nothing on the way
 * back: flipping cancelled → confirmed left the order live with its
 * ingredients still on the shelf, and with both revision-0 claims burned no
 * later path could ever deduct them. The status handler must re-deplete when
 * an order leaves 'cancelled' for any active status.
 *
 * The re-depletion itself (fresh revision, best-effort) is proven in
 * `inventory-order-stock-redeplete.test.ts`; this suite pins the wiring and
 * the guards around it.
 */

import { updateOrderStatus } from '@/lib/orders-service'

const verifyTenantPermission = jest.fn()
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: unknown[]) => verifyTenantPermission(...args),
}))

const redepleteOrderStockBestEffort = jest.fn()
const reverseOrderStockBestEffort = jest.fn()
jest.mock('@/lib/inventory/order-stock-service', () => ({
  redepleteOrderStockBestEffort: (...args: unknown[]) =>
    redepleteOrderStockBestEffort(...args),
  reverseOrderStockBestEffort: (...args: unknown[]) =>
    reverseOrderStockBestEffort(...args),
}))

jest.mock('@/lib/loyverse/push-service', () => ({
  pushOrderToLoyverseBestEffort: jest.fn(() => Promise.resolve()),
}))

const from = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: (...a: unknown[]) => from(...a) }),
}))

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'

/** The order as it exists before the update, and the row the update returns. */
function stubOrders(previousStatus: OrderStatus | null, nextStatus: OrderStatus) {
  return (table: string) => {
    if (table === 'orders') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: previousStatus ? { id: 'o1', status: previousStatus } : null,
                  error: null,
                }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: () =>
                  Promise.resolve({ data: { id: 'o1', status: nextStatus }, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    return {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  verifyTenantPermission.mockResolvedValue({ userRole: null })
  redepleteOrderStockBestEffort.mockResolvedValue(undefined)
  reverseOrderStockBestEffort.mockResolvedValue(undefined)
})

describe('updateOrderStatus stock movement on status changes', () => {
  it('re-depletes when a cancelled order is made active again', async () => {
    // Arrange
    from.mockImplementation(stubOrders('cancelled', 'confirmed'))

    // Act
    await updateOrderStatus('o1', 't1', 'confirmed')

    // Assert
    expect(redepleteOrderStockBestEffort).toHaveBeenCalledWith('t1', 'o1')
    expect(reverseOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it.each(['pending', 'preparing', 'ready', 'delivered'] as const)(
    're-depletes on cancelled → %s',
    async (nextStatus) => {
      from.mockImplementation(stubOrders('cancelled', nextStatus))

      await updateOrderStatus('o1', 't1', nextStatus)

      expect(redepleteOrderStockBestEffort).toHaveBeenCalledWith('t1', 'o1')
    },
  )

  it('does not re-deplete a status change between two active statuses', async () => {
    from.mockImplementation(stubOrders('confirmed', 'preparing'))

    await updateOrderStatus('o1', 't1', 'preparing')

    expect(redepleteOrderStockBestEffort).not.toHaveBeenCalled()
    expect(reverseOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('still restores stock when an active order is cancelled', async () => {
    from.mockImplementation(stubOrders('confirmed', 'cancelled'))

    await updateOrderStatus('o1', 't1', 'cancelled')

    expect(reverseOrderStockBestEffort).toHaveBeenCalledWith('t1', 'o1')
    expect(redepleteOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('moves nothing when re-cancelling an already cancelled order', async () => {
    from.mockImplementation(stubOrders('cancelled', 'cancelled'))

    await updateOrderStatus('o1', 't1', 'cancelled')

    expect(reverseOrderStockBestEffort).not.toHaveBeenCalled()
    expect(redepleteOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('does not re-deplete when the previous status is unknown', async () => {
    // A missing pre-read must not be read as "was cancelled".
    from.mockImplementation(stubOrders(null, 'confirmed'))

    await updateOrderStatus('o1', 't1', 'confirmed')

    expect(redepleteOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('returns the updated order even though stock moved', async () => {
    from.mockImplementation(stubOrders('cancelled', 'confirmed'))

    const updated = await updateOrderStatus('o1', 't1', 'confirmed')

    expect(updated).toMatchObject({ id: 'o1', status: 'confirmed' })
  })
})
