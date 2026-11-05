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
import { simulateOrderStockClaim, type ClaimRpcArgs, type ClaimRpcState } from '../fixtures/order-stock-claim-rpc'

const from = jest.fn()
const rpc = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a), rpc: (...a: unknown[]) => rpc(...a) }),
}))

const ITEMS = [{ menuItemId: 'm1', quantity: 1 }]
const ORDER = 'order-1'
const FLOUR = 'flour'
const GRAM = 'g'

/**
 * The guard used to be a SELECT over `stock_movements`, then an INSERT into
 * `order_stock_applications` followed by a separate ledger write. The claim
 * and its rows are now ONE call (`apply_order_stock_claim`), so the database
 * says no to a second caller and nothing half-done can be left behind.
 */
function world(state: ClaimRpcState) {
  rpc.mockImplementation(async (name: string, args: ClaimRpcArgs) =>
    name === 'apply_order_stock_claim' ? simulateOrderStockClaim(state, args) : { data: 0, error: null })
  from.mockImplementation((table: string) => {
    const data: Record<string, unknown[]> = {
      recipes: [{ id: 'r1', menu_item_id: 'm1', target_type: 'menu_item', target_id: null }],
      recipe_components: [{ id: 'c1', recipe_id: 'r1', inventory_item_id: FLOUR, unit_id: GRAM, quantity: 10 }],
      inventory_items: [{ id: FLOUR, name: 'Flour', stock_unit_id: GRAM, current_qty: 100 }],
      inventory_units: [{ id: GRAM, name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }],
    }
    const chain: Record<string, unknown> = {
      select: () => chain, eq: () => chain, in: () => chain,
      then: (resolve: (r: unknown) => unknown) => resolve({ data: data[table] ?? [], error: null }),
    }
    return chain
  })
}

beforeEach(() => {
  from.mockReset()
  rpc.mockReset()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('order stock movement guards', () => {
  it('refuses to deplete the same order twice', async () => {
    const state: ClaimRpcState = { claims: [{ reason: 'sale', revision: 0, kind: 'order' }], movements: [] }
    world(state)

    const result = await applyOrderStockMovements('t1', ORDER, ITEMS, 'sale')

    expect(result.outcome).toBe('duplicate')
    expect(result.movementCount).toBe(0)
    expect(state.movements).toHaveLength(0)
  })

  it('proceeds when this order has not been depleted yet, claiming WITH its rows', async () => {
    const state: ClaimRpcState = { claims: [], movements: [] }
    world(state)

    const result = await applyOrderStockMovements('t1', ORDER, ITEMS, 'sale')

    expect(result.outcome).toBe('applied')
    expect(state.claims).toEqual([expect.objectContaining({ reason: 'sale', revision: 0, kind: 'order' })])
    expect(state.movements).toEqual([expect.objectContaining({ inventory_item_id: FLOUR, quantity_delta: -10 })])
  })

  it('does not treat a sale as an already-recorded void', async () => {
    // The claim keys on direction as well as order: an order that was depleted
    // must still be restorable on its own terms.
    const state: ClaimRpcState = { claims: [{ reason: 'sale', revision: 0, kind: 'order' }], movements: [] }
    world(state)

    await applyOrderStockMovements('t1', ORDER, ITEMS, 'void')

    expect(state.claims).toContainEqual(expect.objectContaining({ reason: 'void' }))
  })

  it('a failed write leaves no claim behind, so the retry deducts', async () => {
    const state: ClaimRpcState = {
      claims: [], movements: [],
      onInsert: () => { throw new Error('connection reset') },
    }
    world(state)

    await expect(applyOrderStockMovements('t1', ORDER, ITEMS, 'sale')).rejects.toThrow('connection reset')
    expect(state.claims).toHaveLength(0)

    state.onInsert = undefined
    const retry = await applyOrderStockMovements('t1', ORDER, ITEMS, 'sale')
    expect(retry.outcome).toBe('applied')
    expect(state.movements).toHaveLength(1)
  })
})
