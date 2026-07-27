/**
 * Authorized stock restore for orders the web admin cancels directly.
 *
 * `updateOrderStatus` restores stock for platform-backed orders, but the web
 * admin cancels a Convex-held order through `useUpdateConvexOrderStatus`
 * (src/components/admin/convex-order-sheet.tsx), which never reaches it. The
 * merchant app already restores those; without this the SAME cancellation
 * behaved differently depending on where it was performed.
 *
 * The reversal itself is already covered by inventory-order-stock-reverse; what
 * matters here is that it cannot be triggered for a tenant the caller has no
 * permission over.
 */

import { restoreOrderStock } from '@/lib/inventory/stock-service'

const verifyTenantPermission = jest.fn()
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: unknown[]) => verifyTenantPermission(...args),
}))

const reverseOrderStockBestEffort = jest.fn()
jest.mock('@/lib/inventory/order-stock-service', () => ({
  reverseOrderStockBestEffort: (...args: unknown[]) =>
    reverseOrderStockBestEffort(...args),
}))

describe('restoreOrderStock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    verifyTenantPermission.mockResolvedValue(undefined)
  })

  it('reverses the order-s sale movements for an authorized caller', async () => {
    // Act
    await restoreOrderStock('t1', 'jh7dm2p8qr3n5x9')

    // Assert
    expect(reverseOrderStockBestEffort).toHaveBeenCalledWith('t1', 'jh7dm2p8qr3n5x9')
  })

  it('checks permission against the orders capability', async () => {
    // Act
    await restoreOrderStock('t1', 'order-1')

    // Assert — restoring stock is a consequence of cancelling an order, so it
    // is gated on the same capability as changing an order's status.
    expect(verifyTenantPermission).toHaveBeenCalledWith('t1', 'orders')
  })

  it('does not touch the ledger when the caller lacks permission', async () => {
    // Arrange
    verifyTenantPermission.mockRejectedValue(new Error('Forbidden'))

    // Act / Assert
    await expect(restoreOrderStock('t1', 'order-1')).rejects.toThrow('Forbidden')
    expect(reverseOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('verifies permission before reversing, never after', async () => {
    // Arrange — order matters: a reversal that ran first would already have
    // written to another tenant's ledger by the time the check threw.
    const calls: string[] = []
    verifyTenantPermission.mockImplementation(async () => {
      calls.push('verify')
    })
    reverseOrderStockBestEffort.mockImplementation(async () => {
      calls.push('reverse')
    })

    // Act
    await restoreOrderStock('t1', 'order-1')

    // Assert
    expect(calls).toEqual(['verify', 'reverse'])
  })
})
