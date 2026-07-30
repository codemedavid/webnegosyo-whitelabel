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
 * Stubs the idempotency claim. `alreadyApplied` decides whether this caller
 * wins the race for the order or loses it to one that got there first.
 *
 * The guard used to be a SELECT over `stock_movements`, which is why these
 * tests were written against that table. It is now an INSERT into
 * `order_stock_applications` whose unique index makes the database — not a
 * read-then-write in application code — the thing that says no.
 */
function stubClaim(alreadyApplied: boolean, onInsert?: (row: Record<string, unknown>) => void) {
  return {
    insert: (row: Record<string, unknown>) => {
      onInsert?.(row)
      return Promise.resolve({
        data: null,
        // 23505 is Postgres unique_violation: someone claimed it first.
        error: alreadyApplied ? { code: '23505', message: 'duplicate key' } : null,
      })
    },
    // Releasing the claim when nothing was written, so a retry still works.
    delete: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) }),
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
    // Arrange — another caller already claimed this order's sale.
    from.mockImplementation((table: string) => {
      if (table === 'order_stock_applications') return stubClaim(true)
      return NO_RECIPES
    })

    // Act
    const result = await applyOrderStockMovements('t1', ORDER, ITEMS, 'sale')

    // Assert — it stops at the claim and never reads recipes.
    expect(result.movementCount).toBe(0)
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('order_stock_applications')
  })

  it('proceeds when this order has not been depleted yet', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'order_stock_applications') return stubClaim(false)
      return NO_RECIPES
    })

    await applyOrderStockMovements('t1', ORDER, ITEMS, 'sale')

    // Claim won, so it went on to look for recipes.
    expect(from).toHaveBeenCalledWith('recipes')
  })

  it('does not treat a sale as an already-recorded void', async () => {
    // The guard has to key on direction as well as order: an order that was
    // depleted and then restored must still be restorable/depletable on its own
    // terms, not blocked by the other direction's row.
    const claimed: Record<string, unknown>[] = []
    from.mockImplementation((table: string) => {
      if (table === 'order_stock_applications') {
        return stubClaim(false, (row) => claimed.push(row))
      }
      return NO_RECIPES
    })

    await applyOrderStockMovements('t1', ORDER, ITEMS, 'void')

    expect(claimed).toContainEqual(expect.objectContaining({ reason: 'void' }))
  })
})
