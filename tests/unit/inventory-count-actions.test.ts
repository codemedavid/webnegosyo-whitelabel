/**
 * The server actions a stock-count screen calls.
 *
 * These are the boundary between a browser and the count session, so the things
 * worth pinning are the boundary's own duties: that a refusal comes back as a
 * message a merchant can read instead of an unhandled throw, and that the
 * tenant is taken from the server's own argument rather than from anything the
 * client composed.
 */

import {
  openStockCountAction,
  closeStockCountAction,
} from '@/app/actions/inventory-counts'

const TENANT = 'tenant-1'
const SLUG = 'demo'
const NORTH = 'o-north'

const openCount = jest.fn()
const closeCount = jest.fn()

jest.mock('@/lib/inventory/count-session-service', () => ({
  openCount: (...a: unknown[]) => openCount(...a),
  closeCount: (...a: unknown[]) => closeCount(...a),
}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

beforeEach(() => {
  openCount.mockReset().mockResolvedValue({
    id: 'count-1',
    outletId: null,
    businessDay: '2026-07-31',
    expectedItemCount: 12,
    closedAt: null,
  })
  closeCount.mockReset().mockResolvedValue(undefined)
})

describe('openStockCountAction', () => {
  it('returns the session the merchant is now counting into', async () => {
    const result = await openStockCountAction(TENANT, SLUG, { outletId: NORTH })

    expect(result).toMatchObject({ success: true })
    expect(openCount).toHaveBeenCalledWith(TENANT, expect.objectContaining({ outletId: NORTH }))
  })

  it('takes the tenant from the server argument, never from the input', async () => {
    // The whole reason this boundary exists. A tenant read out of client input
    // would let one shop open a count against another's shelf.
    await openStockCountAction(TENANT, SLUG, {
      outletId: null,
      tenantId: 'someone-else',
    } as never)

    expect(openCount).toHaveBeenCalledWith(TENANT, expect.anything())
  })

  it('hands back a refusal as words rather than throwing', async () => {
    openCount.mockRejectedValue(new Error('You can only move stock at your own branch'))

    const result = await openStockCountAction(TENANT, SLUG, { outletId: NORTH })

    expect(result).toEqual({
      success: false,
      error: 'You can only move stock at your own branch',
    })
  })

  it('treats the store pool as a real shelf rather than a missing one', async () => {
    // `null` is the unbranched store pool, which most tenants count every day.
    // Rejecting it as absent would make the action unusable for them.
    const result = await openStockCountAction(TENANT, SLUG, { outletId: null })

    expect(result).toMatchObject({ success: true })
  })
})

describe('closeStockCountAction', () => {
  it('closes the count', async () => {
    const result = await closeStockCountAction(TENANT, SLUG, 'count-1')

    expect(result).toEqual({ success: true })
    expect(closeCount).toHaveBeenCalledWith(TENANT, 'count-1')
  })

  it('explains a double close instead of throwing', async () => {
    // Two people finishing the same count from two phones, which is exactly how
    // a count ends in a real kitchen.
    closeCount.mockRejectedValue(new Error('That stock count is already closed'))

    const result = await closeStockCountAction(TENANT, SLUG, 'count-1')

    expect(result).toEqual({
      success: false,
      error: 'That stock count is already closed',
    })
  })

  it('refuses an empty count id without reaching the service', async () => {
    const result = await closeStockCountAction(TENANT, SLUG, '')

    expect(result).toMatchObject({ success: false })
    expect(closeCount).not.toHaveBeenCalled()
  })
})
