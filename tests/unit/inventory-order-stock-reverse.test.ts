/**
 * Phase 4B follow-up — restoring stock by reversing what was recorded.
 *
 * Cancellation restore used to recompute depletion from the order's lines. The
 * moment depletion became option-aware that became a drift bug: a sale that
 * spent base + option would be restored as base only, leaving stock permanently
 * short by the option's ingredients.
 *
 * Reversing the recorded `sale` movements makes restore exact by construction —
 * it cannot disagree with the sale, because it is derived from it.
 */

import { reverseOrderStockMovements } from '@/lib/inventory/order-stock-service'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

/**
 * The order's recorded sale movements, and a capture of what gets inserted.
 *
 * Two reads happen: the sale rows, then an already-restored guard keyed on
 * `reason = 'void'`. The stub answers by reason so both are modelled honestly
 * rather than collapsed into one shape.
 */
function stubLedger(saleRows: unknown[], captured: unknown[][], voidRows: unknown[] = []) {
  return {
    select: () => {
      let reason: string | undefined
      const chain = {
        eq: (column: string, value: string) => {
          if (column === 'reason') reason = value
          return chain
        },
        limit: () => Promise.resolve({ data: reason === 'void' ? voidRows : saleRows, error: null }),
        then: (resolve: (r: unknown) => unknown) =>
          resolve({ data: reason === 'void' ? voidRows : saleRows, error: null }),
      }
      return chain
    },
    insert: (rows: unknown[]) => {
      captured.push(rows)
      return Promise.resolve({ data: rows, error: null })
    },
  }
}

const SALE_ROWS = [
  { inventory_item_id: 'ing-flour', quantity_delta: -600, entered_quantity: 0.6, entered_unit_id: 'kg' },
  { inventory_item_id: 'ing-cheese', quantity_delta: -80, entered_quantity: 80, entered_unit_id: 'g' },
]

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('reverseOrderStockMovements', () => {
  it('writes the exact negation of every recorded sale movement', async () => {
    // Arrange
    const captured: unknown[][] = []
    from.mockImplementation(() => stubLedger(SALE_ROWS, captured))

    // Act
    const result = await reverseOrderStockMovements('t1', 'order-1')

    // Assert — same ingredients, opposite signs, nothing recomputed.
    expect(result.movementCount).toBe(2)
    expect(captured[0]).toEqual([
      expect.objectContaining({
        inventory_item_id: 'ing-flour', reason: 'void', quantity_delta: 600, order_id: 'order-1',
      }),
      expect.objectContaining({
        inventory_item_id: 'ing-cheese', reason: 'void', quantity_delta: 80, order_id: 'order-1',
      }),
    ])
  })

  it('restores option ingredients the sale spent, not just the base recipe', async () => {
    // This is the drift the reversal exists to prevent: whatever the sale took,
    // including an option's ingredients, comes back.
    const captured: unknown[][] = []
    from.mockImplementation(() =>
      stubLedger(
        [...SALE_ROWS, { inventory_item_id: 'ing-truffle', quantity_delta: -5, entered_quantity: 5, entered_unit_id: 'g' }],
        captured,
      ),
    )

    await reverseOrderStockMovements('t1', 'order-1')

    expect(captured[0]).toContainEqual(
      expect.objectContaining({ inventory_item_id: 'ing-truffle', quantity_delta: 5 }),
    )
  })

  it('does nothing when the order never depleted anything', async () => {
    const captured: unknown[][] = []
    from.mockImplementation(() => stubLedger([], captured))

    const result = await reverseOrderStockMovements('t1', 'order-1')

    expect(result.movementCount).toBe(0)
    expect(captured).toEqual([])
  })

  it('carries the original entered quantity and unit onto the reversal', async () => {
    // So the restored row reads "0.6 kg returned", matching the sale's audit
    // trail rather than showing a bare converted number.
    const captured: unknown[][] = []
    from.mockImplementation(() => stubLedger([SALE_ROWS[0]], captured))

    await reverseOrderStockMovements('t1', 'order-1')

    expect(captured[0][0]).toEqual(
      expect.objectContaining({ entered_quantity: 0.6, entered_unit_id: 'kg' }),
    )
  })
})
