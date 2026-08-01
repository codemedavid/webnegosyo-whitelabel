/**
 * What a branch can actually put on a van.
 *
 * The transfers screen shipped offering every ingredient in the store and
 * accepting any quantity for it. The refusal came from `apply_stock_movement()`
 * at send time, which is correct and far too late: by then the merchant has
 * chosen a branch, added lines, typed quantities and pressed Create, and the
 * only thing the system has told them is no.
 *
 * The answer belongs to the SOURCE branch, not the store. A chain holding 700g
 * of flour across four shops cannot send 700g from one of them, and the roll-up
 * is exactly the number that says it can.
 */

import {
  ingredientsAvailableAt,
  overDraftedItemIds,
  type TransferStockableIngredient,
} from '@/lib/inventory/transfer-availability'
import { indexStockRows, type BranchStockRow } from '@/lib/inventory/stock-location'

const NORTH = 'o-north'
const SOUTH = 'o-south'

const FLOUR: TransferStockableIngredient = { id: 'item-flour', name: 'Flour', unit: 'g' }
const SUGAR: TransferStockableIngredient = { id: 'item-sugar', name: 'Sugar', unit: 'g' }
const YEAST: TransferStockableIngredient = { id: 'item-yeast', name: 'Yeast', unit: 'g' }

const INGREDIENTS = [FLOUR, SUGAR, YEAST]

const row = (overrides: Partial<BranchStockRow> = {}): BranchStockRow => ({
  inventory_item_id: 'item-flour',
  outlet_id: NORTH,
  current_qty: 500,
  reorder_level: 0,
  ...overrides,
})

/** North: 500 flour, 0 sugar (a real row), no yeast row at all. South: 200 yeast. */
const INDEX = indexStockRows([
  row({ inventory_item_id: 'item-flour', outlet_id: NORTH, current_qty: 500 }),
  row({ inventory_item_id: 'item-sugar', outlet_id: NORTH, current_qty: 0 }),
  row({ inventory_item_id: 'item-flour', outlet_id: SOUTH, current_qty: 200 }),
  row({ inventory_item_id: 'item-yeast', outlet_id: SOUTH, current_qty: 200 }),
  row({ inventory_item_id: 'item-flour', outlet_id: null, current_qty: 40 }),
])

describe('ingredientsAvailableAt', () => {
  it('offers only what the source branch is actually holding', () => {
    const available = ingredientsAvailableAt(INGREDIENTS, INDEX, NORTH)

    expect(available.map((item) => item.id)).toEqual(['item-flour'])
  })

  it('reports the branch quantity, never the chain roll-up', () => {
    // 740g of flour exists across the chain. North can send 500 of it.
    const [flour] = ingredientsAvailableAt(INGREDIENTS, INDEX, NORTH)

    expect(flour.onHand).toBe(500)
  })

  it('drops an ingredient the branch holds a zero row for', () => {
    // A row saying "North has no sugar" is not a reason to offer sugar. This is
    // the opposite of the catalogue view, which keeps a zero item listed so a
    // manager can receive their first delivery of it -- but nobody can send one.
    expect(ingredientsAvailableAt(INGREDIENTS, INDEX, NORTH).some((i) => i.id === 'item-sugar')).toBe(
      false,
    )
  })

  it('drops an ingredient the branch has no row for at all', () => {
    expect(ingredientsAvailableAt(INGREDIENTS, INDEX, NORTH).some((i) => i.id === 'item-yeast')).toBe(
      false,
    )
  })

  it('treats the unbranched store pool as a source like any other', () => {
    // A shop that opened a second branch still has stock in the pool, and
    // moving it out of there is exactly what this screen is for.
    const available = ingredientsAvailableAt(INGREDIENTS, INDEX, null)

    expect(available).toEqual([expect.objectContaining({ id: 'item-flour', onHand: 40 })])
  })

  it('offers a different list once the source branch changes', () => {
    expect(ingredientsAvailableAt(INGREDIENTS, INDEX, SOUTH).map((i) => i.id)).toEqual([
      'item-flour',
      'item-yeast',
    ])
  })

  it('offers nothing from a branch that is holding nothing', () => {
    expect(ingredientsAvailableAt(INGREDIENTS, INDEX, 'o-unstocked')).toEqual([])
  })

  it('will not offer stock a branch has gone negative on', () => {
    // Negative on-hand means a sale landed before its delivery was recorded.
    // There is nothing on that shelf to load onto a van.
    const index = indexStockRows([row({ current_qty: -5 })])

    expect(ingredientsAvailableAt([FLOUR], index, NORTH)).toEqual([])
  })

  it('does not mutate the ingredient list it was given', () => {
    const ingredients = [...INGREDIENTS]
    ingredientsAvailableAt(ingredients, INDEX, NORTH)

    expect(ingredients).toEqual(INGREDIENTS)
  })
})

describe('overDraftedItemIds', () => {
  it('names a line asking for more than the branch holds', () => {
    const over = overDraftedItemIds([{ inventoryItemId: 'item-flour', quantity: 501 }], INDEX, NORTH)

    expect(over).toEqual(['item-flour'])
  })

  it('allows a line that empties the shelf exactly', () => {
    // Sending everything is a real thing to do -- a shop closing for the day,
    // or a branch handing its stock to the one still trading.
    expect(overDraftedItemIds([{ inventoryItemId: 'item-flour', quantity: 500 }], INDEX, NORTH)).toEqual(
      [],
    )
  })

  it('ignores rounding dust rather than refusing on it', () => {
    // Quantities are NUMERIC(16,4). A ten-thousandth over is arithmetic, not
    // an over-draft, and refusing on it would block a legitimate "send it all".
    expect(
      overDraftedItemIds([{ inventoryItemId: 'item-flour', quantity: 500.00001 }], INDEX, NORTH),
    ).toEqual([])
  })

  it('names a line for something the branch does not hold at all', () => {
    expect(overDraftedItemIds([{ inventoryItemId: 'item-yeast', quantity: 1 }], INDEX, NORTH)).toEqual(
      ['item-yeast'],
    )
  })

  it('re-answers against the source branch it is asked about', () => {
    // The same draft is fine from South and impossible from North.
    const lines = [{ inventoryItemId: 'item-yeast', quantity: 50 }]

    expect(overDraftedItemIds(lines, INDEX, SOUTH)).toEqual([])
    expect(overDraftedItemIds(lines, INDEX, NORTH)).toEqual(['item-yeast'])
  })

  it('names every offending line, not just the first', () => {
    const over = overDraftedItemIds(
      [
        { inventoryItemId: 'item-flour', quantity: 900 },
        { inventoryItemId: 'item-yeast', quantity: 1 },
      ],
      INDEX,
      NORTH,
    )

    expect(over).toEqual(['item-flour', 'item-yeast'])
  })

  it('says nothing about an empty draft', () => {
    expect(overDraftedItemIds([], INDEX, NORTH)).toEqual([])
  })
})
