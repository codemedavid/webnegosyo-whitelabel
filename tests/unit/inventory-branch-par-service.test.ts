/**
 * C3 — a branch's own reorder level.
 *
 * Phase C made alerting branch-aware: `branchLevelInputs` already reads
 * `inventory_stock.reorder_level` and falls back to the store's when a branch
 * has not set one. So every branched tenant is alerted correctly today. What is
 * missing is the ability to SET the branch figure — to give a quiet shop a
 * lower threshold than a busy one.
 *
 * The hazard this file exists to pin down is the write itself. `inventory_stock`
 * rows are trigger-maintained: `current_qty` is owned by `apply_stock_movement`
 * and the roll-up on `inventory_items` is derived from it. A naive upsert would
 * carry `current_qty: 0` onto an existing row and silently empty a shelf that
 * is physically full — a stock loss written by a settings screen.
 */

import { setBranchReorderLevel } from '@/lib/inventory/branch-par-service'

jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: jest.fn(() => Promise.resolve()),
}))

const from = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: (...a: unknown[]) => from(...a) }),
}))

const TENANT = '44444444-4444-4444-8444-444444444444'
const FLOUR = '11111111-1111-4111-8111-111111111111'
const SOUTH = '22222222-2222-4222-8222-222222222222'

/**
 * Chainable Supabase stub recording every call. `updated` decides whether the
 * UPDATE found a row, which is what drives the insert-or-not branch.
 */
function wire(updated: unknown[] = [{ id: 'row-1' }]) {
  const calls: Record<string, unknown[][]> = {}
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve({ data: updated, error: null }),
    calls,
  }
  for (const method of ['select', 'update', 'insert', 'eq', 'is']) {
    chain[method] = (...args: unknown[]) => {
      calls[method] = [...(calls[method] ?? []), args]
      return chain
    }
  }
  from.mockImplementation(() => chain)
  return chain as unknown as { calls: Record<string, unknown[][]> }
}

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('setBranchReorderLevel', () => {
  it("writes the level onto the branch's own row", async () => {
    const chain = wire()

    await setBranchReorderLevel(TENANT, FLOUR, SOUTH, 5)

    expect(chain.calls.update?.[0]?.[0]).toMatchObject({ reorder_level: 5 })
    expect(chain.calls.eq).toEqual(
      expect.arrayContaining([['outlet_id', SOUTH]]),
    )
  })

  it('never touches current_qty on a row that already exists', async () => {
    // THE hazard. current_qty is owned by the apply_stock_movement trigger and
    // rolled up onto inventory_items. An upsert carrying a default zero would
    // empty a physically full shelf from a settings screen, and the ledger
    // would have no movement explaining where the stock went.
    const chain = wire()

    await setBranchReorderLevel(TENANT, FLOUR, SOUTH, 5)

    expect(chain.calls.update?.[0]?.[0]).not.toHaveProperty('current_qty')
    expect(chain.calls.insert).toBeUndefined()
  })

  it('creates a row at zero stock when the branch has none yet', async () => {
    // The quiet-shop case, and the reason this cannot be update-only: a branch
    // that has never received stock has no row, and it is exactly the branch
    // whose owner wants a lower threshold before the first delivery.
    const chain = wire([])

    await setBranchReorderLevel(TENANT, FLOUR, SOUTH, 5)

    expect(chain.calls.insert?.[0]?.[0]).toMatchObject({
      tenant_id: TENANT,
      inventory_item_id: FLOUR,
      outlet_id: SOUTH,
      reorder_level: 5,
      current_qty: 0,
    })
  })

  it('addresses the unbranched store pool with IS NULL, not equality', async () => {
    // `outlet_id = NULL` matches nothing in SQL. Getting this wrong would
    // silently create a second pool row on every save.
    const chain = wire()

    await setBranchReorderLevel(TENANT, FLOUR, null, 5)

    expect(chain.calls.is).toEqual(expect.arrayContaining([['outlet_id', null]]))
  })

  it('rejects a negative threshold', async () => {
    // A negative par level can never be crossed, so it reads as "never warn me"
    // while looking like a configured threshold.
    await expect(setBranchReorderLevel(TENANT, FLOUR, SOUTH, -1)).rejects.toThrow()
  })

  it('rejects a threshold that is not a number', async () => {
    await expect(setBranchReorderLevel(TENANT, FLOUR, SOUTH, Number.NaN)).rejects.toThrow()
  })

  it('accepts zero as "fall back to the store level"', async () => {
    // Zero is how branchLevelInputs already spells "this branch has not chosen
    // one", so clearing a branch override has to be expressible.
    const chain = wire()

    await setBranchReorderLevel(TENANT, FLOUR, SOUTH, 0)

    expect(chain.calls.update?.[0]?.[0]).toMatchObject({ reorder_level: 0 })
  })

  it('checks the caller may manage this tenant before writing', async () => {
    const { verifyTenantPermission } = jest.requireMock('@/lib/admin-service')
    wire()

    await setBranchReorderLevel(TENANT, FLOUR, SOUTH, 5)

    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'menu')
  })
})
