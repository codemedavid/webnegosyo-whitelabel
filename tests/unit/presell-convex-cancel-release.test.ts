/**
 * Releasing presell stock when a Convex-backed order is cancelled.
 *
 * `updateOrderStatus` releases the claim for platform-backed orders, but a
 * Convex tenant's cancel never reaches it — the sheet cancels through a Convex
 * mutation and then restores ingredients through its own action. Presell was
 * left out of that second path, so a cancelled pre-order kept its dates sold
 * out forever. Observed on SeaCook: cancelling a 3-unit pre-order left
 * sold_qty at 3 and wrote no void row.
 *
 * The claim travels in customer_data precisely so any backend's cancel can
 * find it, so the release reads it from the order rather than from a table.
 */

import { releasePresellForCancelledConvexOrder } from '@/lib/presell/convex-cancel'

const releasePresellForOrder = jest.fn()
jest.mock('@/lib/presell/order-claim', () => ({
  releasePresellForOrder: (...a: unknown[]) => releasePresellForOrder(...a),
}))

const supabase = { from: jest.fn() } as never
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => supabase }))

const LINES = [{ menuItemId: 'm-scallops', presellDate: '2026-09-10', quantity: 3 }]

const customerData = {
  customer_name: 'Presell QA',
  presell_date: '2026-09-10',
  presell_claim_id: 'claim-1',
  presell_lines: [{ menu_item_id: 'm-scallops', presell_date: '2026-09-10', quantity: 3 }],
}

beforeEach(() => jest.clearAllMocks())

describe('releasePresellForCancelledConvexOrder', () => {
  it('voids the claim the order was placed under', async () => {
    // Act
    await releasePresellForCancelledConvexOrder('t1', customerData)

    // Assert — same claim id, so the void pairs with the original sale.
    expect(releasePresellForOrder).toHaveBeenCalledWith(supabase, 't1', 'claim-1', LINES)
  })

  it('does nothing for an order that was never a pre-order', async () => {
    await releasePresellForCancelledConvexOrder('t1', { customer_name: 'Walk-in' })
    expect(releasePresellForOrder).not.toHaveBeenCalled()
  })

  it('does nothing when the order carries no customer data at all', async () => {
    await releasePresellForCancelledConvexOrder('t1', null)
    expect(releasePresellForOrder).not.toHaveBeenCalled()
  })

  it('is best-effort: a failed release never throws over the cancellation', async () => {
    // Arrange: the order is already cancelled; a stock write must not undo it.
    releasePresellForOrder.mockRejectedValue(new Error('db down'))

    // Act & Assert
    await expect(releasePresellForCancelledConvexOrder('t1', customerData)).resolves.toBeUndefined()
  })
})
