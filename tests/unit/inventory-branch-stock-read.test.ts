/**
 * Phase 2 wiring — the inventory screen finally shows a branch its own stock.
 *
 * `branch-stock-view.ts` proved the arithmetic, but nothing called it: the
 * admin page still read `inventory_items.current_qty`, the chain-wide roll-up.
 * This is the read that joins the two, and the one the page uses.
 *
 * It goes through the RLS-enforcing server client, like `getOpenStockAlerts`
 * and unlike the order pipeline's service-role writes. That matters twice over
 * now: the `inventory_stock` policy is branch-scoped, so a manager's own query
 * returns only their branch's rows even before `applyBranchStock` runs.
 */

import {
  getBranchStockIndex,
  getScopedIngredients,
} from '@/lib/inventory/branch-stock-read'
import { stockOnHandAt } from '@/lib/inventory/stock-location'
import type { BranchScope } from '@/lib/outlets/branch-scope'

const TENANT = 'tenant-1'
const FLOUR = 'item-flour'
const SUGAR = 'item-sugar'
const NORTH = 'outlet-north'
const SOUTH = 'outlet-south'

const ALL: BranchScope = { kind: 'all' }
const AT_NORTH: BranchScope = { kind: 'branch', outletId: NORTH }

const from = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: (...a: unknown[]) => from(...a) }),
}))

const ingredients = [
  { id: FLOUR, tenant_id: TENANT, name: 'Flour', current_qty: 700, reorder_level: 100 },
  { id: SUGAR, tenant_id: TENANT, name: 'Sugar', current_qty: 300, reorder_level: 50 },
]

const stockRows = [
  { inventory_item_id: FLOUR, outlet_id: NORTH, current_qty: 500, reorder_level: 250 },
  { inventory_item_id: FLOUR, outlet_id: SOUTH, current_qty: 200, reorder_level: 80 },
  { inventory_item_id: SUGAR, outlet_id: SOUTH, current_qty: 300, reorder_level: 50 },
]

/** Records the filters each table was queried with, then resolves its rows. */
function stub(options: { stock?: unknown; stockError?: unknown } = {}) {
  const filters: Array<[string, string, unknown]> = []

  from.mockImplementation((table: string) => {
    const rows =
      table === 'inventory_stock' ? (options.stock ?? stockRows) : ingredients
    const chain: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) =>
        resolve({
          data: options.stockError && table === 'inventory_stock' ? null : rows,
          error: (table === 'inventory_stock' && options.stockError) || null,
        }),
    }
    for (const method of ['select', 'in', 'order']) {
      chain[method] = () => chain
    }
    chain.eq = (column: string, value: unknown) => {
      filters.push([table, column, value])
      return chain
    }
    return chain
  })

  return { filters }
}

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('getBranchStockIndex', () => {
  it('indexes a tenant-s stock rows by item and branch', async () => {
    stub()

    const index = await getBranchStockIndex(TENANT)

    expect(stockOnHandAt(index, FLOUR, NORTH)).toBe(500)
    expect(stockOnHandAt(index, FLOUR, SOUTH)).toBe(200)
  })

  it('scopes the query to the tenant', async () => {
    // The service-role client is not in play here, but a missing tenant filter
    // would still be a cross-tenant read for a superadmin session.
    const { filters } = stub()

    await getBranchStockIndex(TENANT)

    expect(filters).toContainEqual(['inventory_stock', 'tenant_id', TENANT])
  })

  it('returns an empty index rather than throwing when the read fails', async () => {
    // This renders inside the inventory page. A failed stock read must not take
    // the whole screen down — the same choice getOpenStockAlerts makes.
    stub({ stockError: { message: 'boom' } })

    const index = await getBranchStockIndex(TENANT)

    expect(stockOnHandAt(index, FLOUR, NORTH)).toBe(0)
  })
})

describe('getScopedIngredients', () => {
  it('gives a store-wide account the roll-up untouched', async () => {
    stub()

    const items = await getScopedIngredients(TENANT, ALL)

    expect(items.map((i) => i.current_qty)).toEqual([700, 300])
  })

  it('gives a branch account its own branch-s quantities', async () => {
    stub()

    const items = await getScopedIngredients(TENANT, AT_NORTH)

    // Flour: North holds 500 of the chain's 700. Sugar: North holds none.
    expect(items.map((i) => i.current_qty)).toEqual([500, 0])
  })

  it('gives a branch account its own par levels', async () => {
    stub()

    const items = await getScopedIngredients(TENANT, AT_NORTH)

    expect(items[0].reorder_level).toBe(250)
  })

  it('still lists an ingredient the branch has never stocked', async () => {
    // Dropping Sugar would make it un-receivable at North: the manager could
    // never get their first delivery of it onto the shelf.
    stub()

    const items = await getScopedIngredients(TENANT, AT_NORTH)

    expect(items.map((i) => i.id)).toEqual([FLOUR, SUGAR])
  })

  it('falls back to the roll-up when the stock read fails for an owner', async () => {
    // An owner's number is the roll-up anyway, so a failed stock read costs
    // them nothing and the page still renders.
    stub({ stockError: { message: 'boom' } })

    const items = await getScopedIngredients(TENANT, ALL)

    expect(items.map((i) => i.current_qty)).toEqual([700, 300])
  })

  it('shows a branch zero rather than the roll-up when the stock read fails', async () => {
    // The safe direction. Showing the chain total to a branch whose stock could
    // not be read would invite them to sell what they do not have; zero shows
    // them an empty shelf, which is visibly wrong rather than invisibly wrong.
    stub({ stockError: { message: 'boom' } })

    const items = await getScopedIngredients(TENANT, AT_NORTH)

    expect(items.map((i) => i.current_qty)).toEqual([0, 0])
  })
})
