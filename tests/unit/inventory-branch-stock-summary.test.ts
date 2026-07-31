/**
 * The owner's cross-branch view — "who has what, and who has run out?"
 *
 * This is the question the whole multi-branch inventory effort was asked for,
 * and the one the roll-up cannot answer: 700g of flour across the chain reads
 * as healthy whether it is 350/350 or 700/0. The second case is a shop that
 * cannot serve, hidden inside a number that looks fine.
 *
 * It is also the decision a transfer needs. Naming which branch to move FROM
 * and which to move TO is the useful part; naming a quantity is not, so this
 * deliberately does not invent one — the merchant knows how much they want to
 * carry, and a made-up figure would be obeyed rather than judged.
 */

import { summarizeBranchStock } from '@/lib/inventory/branch-stock-summary'
import { indexStockRows, type BranchStockRow } from '@/lib/inventory/stock-location'

const FLOUR = 'item-flour'
const NORTH = 'outlet-north'
const SOUTH = 'outlet-south'
const EAST = 'outlet-east'

const BRANCHES = [
  { id: NORTH, name: 'North' },
  { id: SOUTH, name: 'South' },
]

const stock = (
  inventory_item_id: string,
  outlet_id: string | null,
  current_qty: number,
  reorder_level = 0,
): BranchStockRow => ({ inventory_item_id, outlet_id, current_qty, reorder_level })

describe('summarizeBranchStock', () => {
  it('reports what each branch holds and the chain total', () => {
    const index = indexStockRows([stock(FLOUR, NORTH, 500), stock(FLOUR, SOUTH, 200)])

    const summary = summarizeBranchStock(FLOUR, index, BRANCHES)

    expect(summary.lines).toEqual([
      { outletId: NORTH, name: 'North', quantity: 500 },
      { outletId: SOUTH, name: 'South', quantity: 200 },
    ])
    expect(summary.total).toBe(700)
  })

  it('names the branch that has run out', () => {
    // The case the roll-up hides: 700g in the chain, and a shop that cannot
    // serve the dish at all.
    const index = indexStockRows([stock(FLOUR, NORTH, 700)])

    const summary = summarizeBranchStock(FLOUR, index, BRANCHES)

    expect(summary.emptyBranches.map((b) => b.name)).toEqual(['South'])
  })

  it('counts a negative branch as empty', () => {
    // Stock goes negative when a sale lands before its delivery is recorded.
    // A shelf at -20 is at least as empty as one at 0.
    const index = indexStockRows([stock(FLOUR, NORTH, 700), stock(FLOUR, SOUTH, -20)])

    const summary = summarizeBranchStock(FLOUR, index, BRANCHES)

    expect(summary.emptyBranches.map((b) => b.name)).toEqual(['South'])
  })

  it('suggests moving from the fullest branch to the emptiest', () => {
    const index = indexStockRows([stock(FLOUR, NORTH, 700)])

    const summary = summarizeBranchStock(FLOUR, index, BRANCHES)

    expect(summary.suggestion).toEqual({
      fromOutletId: NORTH,
      fromName: 'North',
      toOutletId: SOUTH,
      toName: 'South',
    })
  })

  it('picks the fullest source when several branches have stock', () => {
    const index = indexStockRows([
      stock(FLOUR, NORTH, 100),
      stock(FLOUR, EAST, 900),
    ])

    const summary = summarizeBranchStock(FLOUR, index, [
      ...BRANCHES,
      { id: EAST, name: 'East' },
    ])

    expect(summary.suggestion).toMatchObject({ fromOutletId: EAST, toOutletId: SOUTH })
  })

  it('suggests no quantity, only a direction', () => {
    // A made-up figure would be obeyed rather than judged. The merchant knows
    // how much they can carry; the system does not.
    const index = indexStockRows([stock(FLOUR, NORTH, 700)])

    const summary = summarizeBranchStock(FLOUR, index, BRANCHES)

    expect(summary.suggestion).not.toHaveProperty('quantity')
  })

  it('suggests nothing when every branch has stock', () => {
    const index = indexStockRows([stock(FLOUR, NORTH, 500), stock(FLOUR, SOUTH, 200)])

    const summary = summarizeBranchStock(FLOUR, index, BRANCHES)

    expect(summary.suggestion).toBeNull()
    expect(summary.emptyBranches).toEqual([])
  })

  it('suggests nothing when nobody has any to give', () => {
    // Every shop is out. There is nothing to move, and pointing at one of them
    // would send a manager on an errand that cannot succeed.
    const index = indexStockRows([])

    const summary = summarizeBranchStock(FLOUR, index, BRANCHES)

    expect(summary.suggestion).toBeNull()
    expect(summary.emptyBranches.map((b) => b.name)).toEqual(['North', 'South'])
  })

  it('says nothing at all for a store with one shop', () => {
    // A single-location tenant has no cross-branch question to answer, and a
    // panel that appeared for them would be noise on every row.
    const index = indexStockRows([stock(FLOUR, null, 500)])

    const summary = summarizeBranchStock(FLOUR, index, [])

    expect(summary.isMultiBranch).toBe(false)
    expect(summary.lines).toEqual([])
    expect(summary.suggestion).toBeNull()
  })

  it('is multi-branch once there are two shops', () => {
    const index = indexStockRows([stock(FLOUR, NORTH, 500)])

    expect(summarizeBranchStock(FLOUR, index, BRANCHES).isMultiBranch).toBe(true)
  })

  it('excludes the unbranched pool from the branch lines', () => {
    // Store-pool stock belongs to no shop. Attributing it to one would tell a
    // manager they hold stock that is not on their shelf.
    const index = indexStockRows([stock(FLOUR, null, 400), stock(FLOUR, NORTH, 500)])

    const summary = summarizeBranchStock(FLOUR, index, BRANCHES)

    expect(summary.lines.map((l) => l.quantity)).toEqual([500, 0])
  })

  it('still counts the unbranched pool in the chain total', () => {
    // The total must keep agreeing with inventory_items.current_qty, which is
    // the sum of every row including the pool. A total that disagreed with the
    // number on the same screen would read as a bug in one of them.
    const index = indexStockRows([stock(FLOUR, null, 400), stock(FLOUR, NORTH, 500)])

    expect(summarizeBranchStock(FLOUR, index, BRANCHES).total).toBe(900)
  })
})
