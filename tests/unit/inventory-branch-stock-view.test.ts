/**
 * Phase 2 of multi-branch inventory — reading and writing stock as one branch.
 *
 * The write path now records which branch spent an ingredient, but every read
 * still shows `inventory_items.current_qty`, the roll-up across the whole
 * chain. That is exactly right for the owner and wrong for a branch manager,
 * who is shown a number that includes stock sitting in a shop they cannot
 * reach — and would then count their own shelf as short.
 *
 * Two rules are pinned here.
 *
 * 1. **A branch account reads its own branch's quantity.** The branch value is
 *    written back onto the item's own `current_qty` / `reorder_level` fields,
 *    exactly as `applyOutletMenuOverrides` writes a branch price back onto
 *    `price`. Every downstream consumer — the table, low-stock evaluation, the
 *    CSV export — then keeps working untouched.
 * 2. **A manual movement may only name a branch its author can reach.** The
 *    owner picks which shop a delivery lands in; a branch manager cannot
 *    receive stock into somebody else's.
 */

import {
  applyBranchStock,
  branchStockBreakdown,
  resolveMovementBranch,
} from '@/lib/inventory/branch-stock-view'
import { indexStockRows, type BranchStockRow } from '@/lib/inventory/stock-location'
import type { BranchScope } from '@/lib/outlets/branch-scope'

const FLOUR = 'item-flour'
const SUGAR = 'item-sugar'
const NORTH = 'outlet-north'
const SOUTH = 'outlet-south'

const ALL: BranchScope = { kind: 'all' }
const AT_NORTH: BranchScope = { kind: 'branch', outletId: NORTH }

const stock = (
  inventory_item_id: string,
  outlet_id: string | null,
  current_qty: number,
  reorder_level = 0,
): BranchStockRow => ({ inventory_item_id, outlet_id, current_qty, reorder_level })

const item = (id: string, current_qty: number, reorder_level = 0) => ({
  id,
  name: id,
  current_qty,
  reorder_level,
  is_active: true,
})

describe('applyBranchStock', () => {
  it('leaves the roll-up alone for a store-wide account', () => {
    // The owner's number is the chain's total, which is what current_qty
    // already holds. Returning the caller's own array avoids copying every row
    // to change nothing — the same choice filterOrdersToScope makes.
    const items = [item(FLOUR, 700)]
    const index = indexStockRows([stock(FLOUR, NORTH, 500), stock(FLOUR, SOUTH, 200)])

    expect(applyBranchStock(items, index, ALL)).toBe(items)
  })

  it('shows a branch account only what its own branch holds', () => {
    const items = [item(FLOUR, 700)]
    const index = indexStockRows([stock(FLOUR, NORTH, 500), stock(FLOUR, SOUTH, 200)])

    const [row] = applyBranchStock(items, index, AT_NORTH)

    expect(row.current_qty).toBe(500)
  })

  it('shows zero rather than the chain total for a branch holding none', () => {
    // The dangerous failure. Falling back to the roll-up would tell a manager
    // with an empty shelf that they have 700g, and the dish would stay on sale.
    const items = [item(FLOUR, 700)]
    const index = indexStockRows([stock(FLOUR, SOUTH, 700)])

    const [row] = applyBranchStock(items, index, AT_NORTH)

    expect(row.current_qty).toBe(0)
  })

  it('applies the branch-s own reorder level', () => {
    // Par levels are per branch: a busy shop reorders sooner than a quiet one.
    const items = [item(FLOUR, 700, 100)]
    const index = indexStockRows([stock(FLOUR, NORTH, 500, 250)])

    const [row] = applyBranchStock(items, index, AT_NORTH)

    expect(row.reorder_level).toBe(250)
  })

  it('does not mutate the items it is given', () => {
    const items = [item(FLOUR, 700)]
    const index = indexStockRows([stock(FLOUR, NORTH, 500)])

    applyBranchStock(items, index, AT_NORTH)

    expect(items[0].current_qty).toBe(700)
  })

  it('keeps every ingredient listed, even one this branch has never stocked', () => {
    // Dropping it would hide the ingredient from the branch's own catalogue,
    // making it un-receivable — the manager could never get their first
    // delivery of it onto the shelf.
    const items = [item(FLOUR, 700), item(SUGAR, 300)]
    const index = indexStockRows([stock(FLOUR, NORTH, 500)])

    const rows = applyBranchStock(items, index, AT_NORTH)

    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ id: SUGAR, current_qty: 0 })
  })
})

describe('branchStockBreakdown', () => {
  const BRANCHES = [
    { id: NORTH, name: 'North' },
    { id: SOUTH, name: 'South' },
  ]

  it('tells the owner what each shop is holding', () => {
    const index = indexStockRows([stock(FLOUR, NORTH, 500), stock(FLOUR, SOUTH, 200)])

    expect(branchStockBreakdown(FLOUR, index, BRANCHES)).toEqual([
      // reorderLevel 0 = this branch has chosen no threshold of its own and
      // inherits the store's. Added in C3.
      { outletId: NORTH, name: 'North', quantity: 500, reorderLevel: 0 },
      { outletId: SOUTH, name: 'South', quantity: 200, reorderLevel: 0 },
    ])
  })

  it('lists a branch holding nothing rather than omitting it', () => {
    // "South has none" is the single most useful thing this view can say. An
    // absent row reads as "no data" and is the one a transfer should target.
    const index = indexStockRows([stock(FLOUR, NORTH, 500)])

    expect(branchStockBreakdown(FLOUR, index, BRANCHES)).toEqual([
      { outletId: NORTH, name: 'North', quantity: 500, reorderLevel: 0 },
      { outletId: SOUTH, name: 'South', quantity: 0, reorderLevel: 0 },
    ])
  })

  it('says nothing at all for a store with no branches', () => {
    const index = indexStockRows([stock(FLOUR, null, 500)])

    expect(branchStockBreakdown(FLOUR, index, [])).toEqual([])
  })
})

describe('resolveMovementBranch', () => {
  it('lets the owner receive into whichever shop they picked', () => {
    expect(resolveMovementBranch(SOUTH, ALL)).toBe(SOUTH)
  })

  it('lets the owner receive into the unbranched pool', () => {
    expect(resolveMovementBranch(null, ALL)).toBeNull()
    expect(resolveMovementBranch('', ALL)).toBeNull()
  })

  it('pins a branch manager to their own branch when they name it', () => {
    expect(resolveMovementBranch(NORTH, AT_NORTH)).toBe(NORTH)
  })

  it('pins a branch manager to their own branch when they name none', () => {
    // A manager's movement must never land in the store pool: it would be
    // invisible on their own screen the moment it was recorded.
    expect(resolveMovementBranch(null, AT_NORTH)).toBe(NORTH)
  })

  it('refuses a branch manager naming another shop', () => {
    // The rule with teeth. Without it a manager could receive, waste, or count
    // stock into a branch they have nothing to do with.
    expect(() => resolveMovementBranch(SOUTH, AT_NORTH)).toThrow(
      /branch/i,
    )
  })
})

describe('branchStockBreakdown — each branch carries its own reorder level', () => {
  it("reports the branch's own par level so the panel can show it", () => {
    // C3. The alert path has read inventory_stock.reorder_level since Phase C,
    // but nothing surfaced it, so a merchant could not tell whether a branch
    // had its own threshold or was inheriting the store's.
    const index = indexStockRows([
      { inventory_item_id: 'i1', outlet_id: 'o-south', current_qty: 8, reorder_level: 5 },
    ])

    const [south] = branchStockBreakdown('i1', index, [{ id: 'o-south', name: 'South' }])

    expect(south.reorderLevel).toBe(5)
  })

  it('reports zero for a branch that has not chosen one', () => {
    // Zero is how branchLevelInputs already spells "unset", and it is what the
    // store-wide fallback keys on. Inventing the store's number here would make
    // an inherited threshold indistinguishable from a chosen one.
    const index = indexStockRows([
      { inventory_item_id: 'i1', outlet_id: 'o-south', current_qty: 8, reorder_level: 0 },
    ])

    const [south] = branchStockBreakdown('i1', index, [{ id: 'o-south', name: 'South' }])

    expect(south.reorderLevel).toBe(0)
  })

  it('reports zero for a branch with no row at all', () => {
    const [south] = branchStockBreakdown('i1', new Map(), [{ id: 'o-south', name: 'South' }])

    expect(south.reorderLevel).toBe(0)
  })
})
