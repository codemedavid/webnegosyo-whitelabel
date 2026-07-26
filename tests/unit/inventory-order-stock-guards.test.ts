/**
 * Phase 4B follow-up — the two holes left open when depletion shipped.
 *
 * 1. Nothing stopped the same order depleting twice. The order-creation path is
 *    retryable and `revalidatePath` sits alongside it; a double-write would take
 *    stock down twice for one sale, with two ledger rows both claiming to be the
 *    truth.
 * 2. A cancelled order kept its ingredients spent. `applyOrderStockMovements`
 *    accepted a 'void' direction from day one and no caller ever passed it.
 */

import { applyOrderStockMovements } from '@/lib/inventory/order-stock-service'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

const ITEMS = [{ menuItemId: 'm1', quantity: 1 }]
const ORDER = 'order-1'

/**
 * Stubs the existing-movements guard. `rows` is what the guard finds already
 * recorded for this order+reason.
 */
function stubMovementCheck(rows: unknown[]) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      }),
    }),
  }
}

const NO_RECIPES = {
  select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
}

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('order stock movement guards', () => {
  it('refuses to deplete the same order twice', async () => {
    // Arrange — a 'sale' movement for this order already exists.
    from.mockImplementation((table: string) => {
      if (table === 'stock_movements') return stubMovementCheck([{ id: 'existing' }])
      return NO_RECIPES
    })

    // Act
    const result = await applyOrderStockMovements('t1', ORDER, ITEMS, 'sale')

    // Assert — it stops at the guard and never reads recipes.
    expect(result.movementCount).toBe(0)
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('stock_movements')
  })

  it('proceeds when this order has not been depleted yet', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'stock_movements') return stubMovementCheck([])
      return NO_RECIPES
    })

    await applyOrderStockMovements('t1', ORDER, ITEMS, 'sale')

    // Guard passed, so it went on to look for recipes.
    expect(from).toHaveBeenCalledWith('recipes')
  })

  it('does not treat a sale as an already-recorded void', async () => {
    // The guard has to key on direction as well as order: an order that was
    // depleted and then restored must still be restorable/depletable on its own
    // terms, not blocked by the other direction's row.
    const seen: unknown[][] = []
    from.mockImplementation((table: string) => {
      if (table === 'stock_movements') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: (...args: unknown[]) => {
                  seen.push(args)
                  return { limit: () => Promise.resolve({ data: [], error: null }) }
                },
              }),
            }),
          }),
        }
      }
      return NO_RECIPES
    })

    await applyOrderStockMovements('t1', ORDER, ITEMS, 'void')

    expect(seen).toContainEqual(['reason', 'void'])
  })
})
