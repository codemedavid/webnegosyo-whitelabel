/**
 * Whether a BRANCH is low, rather than whether the chain is.
 *
 * `stock-alerts-service.ts` evaluates `inventory_items.current_qty` — the
 * roll-up. A two-shop store where North holds 700g of flour and South holds
 * none reads as 700g, comfortably above any threshold, and nobody is told that
 * South cannot cook. That is the exact blindness `BranchStockPanel` was built
 * to make visible, still live on the one path that actually interrupts a
 * merchant.
 *
 * This module turns the store's items into the branch's items, so every
 * decision downstream — crossings, recovery, alert rows — is asked about one
 * shelf.
 */

import { branchLevelInputs } from '@/lib/inventory/branch-stock-levels'
import { evaluateStockLevel, type StockLevelInput } from '@/lib/inventory/low-stock'
import { indexStockRows, type BranchStockRow } from '@/lib/inventory/stock-location'

const NORTH = 'o-north'
const SOUTH = 'o-south'

const item = (over: Partial<StockLevelInput> = {}): StockLevelInput => ({
  id: 'item-flour',
  name: 'Flour',
  current_qty: 700,
  reorder_level: 100,
  is_active: true,
  ...over,
})

const stock = (over: Partial<BranchStockRow> = {}): BranchStockRow => ({
  inventory_item_id: 'item-flour',
  outlet_id: NORTH,
  current_qty: 700,
  reorder_level: 0,
  ...over,
})

describe('branchLevelInputs', () => {
  it('reports the branch quantity in place of the chain roll-up', () => {
    // 700g exists. South has none of it.
    const index = indexStockRows([stock({ outlet_id: NORTH, current_qty: 700 })])

    const [flour] = branchLevelInputs([item()], index, SOUTH)

    expect(flour.current_qty).toBe(0)
  })

  it('makes an empty branch read as out of stock', () => {
    const index = indexStockRows([stock({ outlet_id: NORTH, current_qty: 700 })])

    const [flour] = branchLevelInputs([item()], index, SOUTH)

    expect(evaluateStockLevel(flour)).toBe('out')
  })

  it('uses the branch par level once the branch has one', () => {
    const index = indexStockRows([
      stock({ outlet_id: SOUTH, current_qty: 40, reorder_level: 50 }),
    ])

    const [flour] = branchLevelInputs([item()], index, SOUTH)

    expect(flour.reorder_level).toBe(50)
    expect(evaluateStockLevel(flour)).toBe('low')
  })

  it('falls back to the store threshold when the branch has none of its own', () => {
    // Deliberately UNLIKE applyBranchStock, which shows a branch par or none.
    // That view reports what is configured, and inventing a figure there would
    // misreport the configuration. This asks whether to interrupt someone, and
    // the store-wide level is the merchant's standing answer to "tell me when
    // it gets this low". Without the fallback, switching branches on would
    // silently stop every low-stock alert a tenant already relies on.
    const index = indexStockRows([
      stock({ outlet_id: SOUTH, current_qty: 80, reorder_level: 0 }),
    ])

    const [flour] = branchLevelInputs([item({ reorder_level: 100 })], index, SOUTH)

    expect(flour.reorder_level).toBe(100)
    expect(evaluateStockLevel(flour)).toBe('low')
  })

  it('lets a branch threshold override a higher store one', () => {
    const index = indexStockRows([
      stock({ outlet_id: SOUTH, current_qty: 80, reorder_level: 20 }),
    ])

    const [flour] = branchLevelInputs([item({ reorder_level: 100 })], index, SOUTH)

    // A quiet shop is not nagged with a busy one's threshold.
    expect(evaluateStockLevel(flour)).toBe('ok')
  })

  it('reads the unbranched store pool', () => {
    const index = indexStockRows([
      stock({ outlet_id: null, current_qty: 30 }),
      stock({ outlet_id: NORTH, current_qty: 700 }),
    ])

    const [flour] = branchLevelInputs([item()], index, null)

    expect(flour.current_qty).toBe(30)
  })

  it('keeps every other field on the item untouched', () => {
    const index = indexStockRows([stock({ outlet_id: SOUTH, current_qty: 5 })])

    const [flour] = branchLevelInputs([item()], index, SOUTH)

    expect(flour.id).toBe('item-flour')
    expect(flour.name).toBe('Flour')
    expect(flour.is_active).toBe(true)
  })

  it('does not mutate the items it was given', () => {
    const items = [item()]
    const index = indexStockRows([stock({ outlet_id: SOUTH, current_qty: 5 })])

    branchLevelInputs(items, index, SOUTH)

    expect(items[0].current_qty).toBe(700)
  })

  it('leaves the items alone when there is no branch to scope to', () => {
    // A single-shop tenant, or a movement with no branch on it: the roll-up IS
    // the branch figure, and returning the caller's own array keeps today's
    // behaviour byte-for-byte.
    const items = [item()]
    const index = indexStockRows([stock({ outlet_id: NORTH, current_qty: 700 })])

    expect(branchLevelInputs(items, index, undefined)).toBe(items)
  })

  it('reads zero for a branch with no row at all, never the roll-up', () => {
    // The no-row-means-ZERO rule. Inheriting here would tell a manager with an
    // empty shelf that they hold the whole chain's stock.
    const [flour] = branchLevelInputs([item()], indexStockRows([]), SOUTH)

    expect(flour.current_qty).toBe(0)
  })
})
