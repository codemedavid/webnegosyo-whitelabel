/**
 * Phase 4B — the guarantee that stock accounting can never cost a customer
 * their order.
 *
 * Depletion runs after the order is already saved and paid for. If inventory is
 * misconfigured, the recipes table is unreachable, or a unit is nonsense, the
 * order must still stand. A ledger that drifts is reconcilable; a lost order is
 * not.
 */

import { applyOrderStockBestEffort } from '@/lib/inventory/order-stock-service'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

const ITEMS = [{ menuItemId: 'm1', quantity: 1 }]

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('applyOrderStockBestEffort', () => {
  it('swallows a database failure instead of surfacing it to the order', async () => {
    // Arrange — the recipes read blows up.
    from.mockImplementation(() => {
      throw new Error('connection refused')
    })

    // Act / Assert
    await expect(applyOrderStockBestEffort('t1', 'o1', ITEMS)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  it('swallows a rejected query rather than rejecting', async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({ in: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
      }),
    })

    await expect(applyOrderStockBestEffort('t1', 'o1', ITEMS)).resolves.toBeUndefined()
  })

  it('does nothing at all for an order with no lines', async () => {
    await expect(applyOrderStockBestEffort('t1', 'o1', [])).resolves.toBeUndefined()
    expect(from).not.toHaveBeenCalled()
  })

  it('stops early when the tenant has no recipes for these items', async () => {
    // An uncosted menu is the common case; it must not read further tables.
    // Four touches are expected: claim the order, check no cancellation has
    // spoken for it (the cancel-wins guard), find no recipes, then hand the
    // claim back so a retry after the recipe is added still deducts.
    from.mockImplementation((table: string) => {
      if (table === 'order_stock_applications') {
        const claimChain = {
          eq: () => claimChain,
          then: (resolve: (r: unknown) => unknown) => resolve({ data: [], error: null }),
        }
        return {
          select: () => claimChain,
          insert: () => Promise.resolve({ data: null, error: null }),
          delete: () => ({
            eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
          }),
        }
      }
      return {
        select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
      }
    })

    await applyOrderStockBestEffort('t1', 'o1', ITEMS)

    expect(from.mock.calls.map((c) => c[0])).toEqual([
      'order_stock_applications',
      'order_stock_applications',
      'recipes',
      'order_stock_applications',
    ])
  })
})
