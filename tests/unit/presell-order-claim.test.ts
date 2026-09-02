/**
 * Reserving presell stock at checkout, and giving it back on cancel.
 *
 * The guard answers "does this cart fit?"; the claim answers "did WE get it?"
 * — two customers can both pass the guard for the last bilao, and only the
 * atomic SQL claim decides. A shortfall there is reported by name and date so
 * the customer knows which line to fix, never as a generic failure.
 */

import { claimPresellForOrder, releasePresellForOrder } from '@/lib/presell/order-claim'

const findPresellViolationMessage = jest.fn()
jest.mock('@/lib/presell/checkout-guard', () => ({
  findPresellViolationMessage: (...a: unknown[]) => findPresellViolationMessage(...a),
}))

const applyPresellOrder = jest.fn()
jest.mock('@/lib/presell/claim', () => ({
  applyPresellOrder: (...a: unknown[]) => applyPresellOrder(...a),
}))

const supabase = {} as never

const ITEMS = [
  { menu_item_id: 'm-bilao', menu_item_name: 'Pancit Bilao', quantity: 2, presell_date: '2026-12-24' },
  { menu_item_id: 'm-bilao', menu_item_name: 'Pancit Bilao', quantity: 1, presell_date: '2026-12-24' },
  { menu_item_id: 'm-adobo', menu_item_name: 'Adobo', quantity: 3 },
]

beforeEach(() => {
  jest.clearAllMocks()
  findPresellViolationMessage.mockResolvedValue('')
  applyPresellOrder.mockResolvedValue({ status: 'applied' })
})

describe('claimPresellForOrder', () => {
  it('does nothing for a cart with no presell lines', async () => {
    const result = await claimPresellForOrder(supabase, 't1', 'claim-1', [ITEMS[2]])
    expect(result).toEqual({ ok: true, lines: [] })
    expect(findPresellViolationMessage).not.toHaveBeenCalled()
    expect(applyPresellOrder).not.toHaveBeenCalled()
  })

  it('runs the guard over every line, then claims the aggregated presell demand', async () => {
    const result = await claimPresellForOrder(supabase, 't1', 'claim-1', ITEMS)

    expect(findPresellViolationMessage).toHaveBeenCalledWith('t1', [
      { menuItemId: 'm-bilao', quantity: 2, presellDate: '2026-12-24' },
      { menuItemId: 'm-bilao', quantity: 1, presellDate: '2026-12-24' },
      { menuItemId: 'm-adobo', quantity: 3, presellDate: undefined },
    ])
    expect(applyPresellOrder).toHaveBeenCalledWith(supabase, 't1', 'claim-1', 'sale', [
      { menuItemId: 'm-bilao', presellDate: '2026-12-24', quantity: 3 },
    ])
    expect(result).toEqual({ ok: true, lines: [{ menuItemId: 'm-bilao', presellDate: '2026-12-24', quantity: 3 }] })
  })

  it('refuses with the guard message and never claims', async () => {
    findPresellViolationMessage.mockResolvedValue('Pancit Bilao has only 1 left for Dec 24.')
    const result = await claimPresellForOrder(supabase, 't1', 'claim-1', ITEMS)
    expect(result).toEqual({ ok: false, message: 'Pancit Bilao has only 1 left for Dec 24.' })
    expect(applyPresellOrder).not.toHaveBeenCalled()
  })

  it('names the line that lost the race when the claim falls short', async () => {
    applyPresellOrder.mockResolvedValue({ status: 'shortfall', menuItemId: 'm-bilao', presellDate: '2026-12-24' })
    const result = await claimPresellForOrder(supabase, 't1', 'claim-1', ITEMS)
    expect(result).toEqual({ ok: false, message: 'Pancit Bilao just sold out for Dec 24. Please adjust your cart and try again.' })
  })

  it('refuses, not silently proceeds, when the claim itself errors', async () => {
    applyPresellOrder.mockResolvedValue({ status: 'error', message: 'db down' })
    const result = await claimPresellForOrder(supabase, 't1', 'claim-1', ITEMS)
    expect(result.ok).toBe(false)
    expect(applyPresellOrder).toHaveBeenCalledTimes(1)
  })

  it('treats a repeated claim as success — retries must not double-book or double-refuse', async () => {
    applyPresellOrder.mockResolvedValue({ status: 'already_applied' })
    const result = await claimPresellForOrder(supabase, 't1', 'claim-1', ITEMS)
    expect(result.ok).toBe(true)
  })
})

describe('releasePresellForOrder', () => {
  it('voids the claimed lines under the same claim id', async () => {
    const lines = [{ menuItemId: 'm-bilao', presellDate: '2026-12-24', quantity: 3 }]
    await releasePresellForOrder(supabase, 't1', 'claim-1', lines)
    expect(applyPresellOrder).toHaveBeenCalledWith(supabase, 't1', 'claim-1', 'void', lines)
  })

  it('is best-effort: a failed release never throws', async () => {
    applyPresellOrder.mockRejectedValue(new Error('down'))
    await expect(
      releasePresellForOrder(supabase, 't1', 'claim-1', [{ menuItemId: 'm-bilao', presellDate: '2026-12-24', quantity: 1 }]),
    ).resolves.toBeUndefined()
  })
})
