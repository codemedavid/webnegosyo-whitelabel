/**
 * Phase 1 — stock becomes per-branch.
 *
 * Until now `inventory_items.current_qty` was a single scalar per tenant, so a
 * two-branch store shared one bag of flour: a sale at North silently depleted
 * South. These tests pin the arithmetic of the replacement — one row per
 * (item, branch) — before any of it touches the database.
 *
 * The rule that matters most is the one that differs from `outlet-menu-overrides`:
 * a missing override row means "use the store-wide value", but a missing STOCK
 * row means ZERO, not "use the store-wide pile". Stock is a quantity, and
 * falling back would report the same flour as present at every branch at once.
 */

import {
  STORE_POOL_KEY,
  stockLocationKey,
  indexStockRows,
  stockOnHandAt,
  rollUpOnHand,
  type BranchStockRow,
} from '@/lib/inventory/stock-location'

const FLOUR = 'item-flour'
const SUGAR = 'item-sugar'
const NORTH = 'outlet-north'
const SOUTH = 'outlet-south'

const row = (
  inventory_item_id: string,
  outlet_id: string | null,
  current_qty: number,
  reorder_level = 0,
): BranchStockRow => ({ inventory_item_id, outlet_id, current_qty, reorder_level })

describe('stockLocationKey', () => {
  it('maps a branch to its own id', () => {
    expect(stockLocationKey(NORTH)).toBe(NORTH)
  })

  it('maps an absent branch to the store-wide pool', () => {
    // A single-location tenant stamps no branch on anything. Its stock has to
    // live somewhere, and that somewhere is one unbranched row per item.
    expect(stockLocationKey(null)).toBe(STORE_POOL_KEY)
    expect(stockLocationKey(undefined)).toBe(STORE_POOL_KEY)
  })

  it('reads a blank branch as the store-wide pool', () => {
    // Mirrors `resolveBranchScope`: a blank id is store-wide, never a branch
    // literally named "".
    expect(stockLocationKey('   ')).toBe(STORE_POOL_KEY)
  })
})

describe('stockOnHandAt', () => {
  it('reports what one branch is holding', () => {
    const index = indexStockRows([row(FLOUR, NORTH, 500), row(FLOUR, SOUTH, 200)])

    expect(stockOnHandAt(index, FLOUR, NORTH)).toBe(500)
    expect(stockOnHandAt(index, FLOUR, SOUTH)).toBe(200)
  })

  it('reports zero for a branch with no row, NOT the store-wide pool', () => {
    // The whole point of the phase. If South inherited the unbranched pool,
    // 500g of flour would be reported as present at two places at once and the
    // roll-up would double-count it.
    const index = indexStockRows([row(FLOUR, null, 500)])

    expect(stockOnHandAt(index, FLOUR, SOUTH)).toBe(0)
  })

  it('reports zero for an item nobody stocks', () => {
    const index = indexStockRows([row(FLOUR, NORTH, 500)])

    expect(stockOnHandAt(index, SUGAR, NORTH)).toBe(0)
  })

  it('reads the unbranched pool when no branch is asked for', () => {
    const index = indexStockRows([row(FLOUR, null, 500), row(FLOUR, NORTH, 20)])

    expect(stockOnHandAt(index, FLOUR, null)).toBe(500)
  })

  it('preserves negative stock rather than clamping it', () => {
    // Stock goes negative when a sale lands before its delivery is recorded.
    // Clamping would hide the discrepancy the ledger exists to surface.
    const index = indexStockRows([row(FLOUR, NORTH, -30)])

    expect(stockOnHandAt(index, FLOUR, NORTH)).toBe(-30)
  })
})

describe('rollUpOnHand', () => {
  it('sums every branch into the store total', () => {
    const index = indexStockRows([row(FLOUR, NORTH, 500), row(FLOUR, SOUTH, 200)])

    expect(rollUpOnHand(index, FLOUR)).toBe(700)
  })

  it('includes the unbranched pool in the total', () => {
    // Stock received before the store opened its second branch sits in the
    // unbranched pool. Excluding it would make the owner's total drop the day
    // branches were switched on.
    const index = indexStockRows([row(FLOUR, null, 100), row(FLOUR, NORTH, 500)])

    expect(rollUpOnHand(index, FLOUR)).toBe(600)
  })

  it('counts only the item asked for', () => {
    const index = indexStockRows([row(FLOUR, NORTH, 500), row(SUGAR, NORTH, 900)])

    expect(rollUpOnHand(index, FLOUR)).toBe(500)
  })

  it('is zero for an item with no rows at all', () => {
    expect(rollUpOnHand(indexStockRows([]), FLOUR)).toBe(0)
  })

  it('nets a negative branch against a positive one', () => {
    const index = indexStockRows([row(FLOUR, NORTH, 500), row(FLOUR, SOUTH, -50)])

    expect(rollUpOnHand(index, FLOUR)).toBe(450)
  })
})

describe('indexStockRows', () => {
  it('does not mutate the rows it is given', () => {
    const rows = [row(FLOUR, NORTH, 500)]
    const snapshot = JSON.parse(JSON.stringify(rows))

    indexStockRows(rows)

    expect(rows).toEqual(snapshot)
  })

  it('keeps two branches of the same item apart', () => {
    const index = indexStockRows([row(FLOUR, NORTH, 500), row(FLOUR, SOUTH, 200)])

    expect(index.get(FLOUR)?.size).toBe(2)
  })
})
