/**
 * Phase 5B — low-stock evaluation and crossing detection.
 *
 * The distinction these tests pin down is state vs. crossing. A merchant whose
 * flour sits below its reorder level all afternoon is in a low state for every
 * sale of that afternoon; alerting on the state would mean an alert per sale.
 * Only the movement that takes it *across* the line is news.
 */

import {
  evaluateStockLevel,
  detectStockCrossings,
  type StockLevelInput,
} from '@/lib/inventory/low-stock'

function ingredient(overrides: Partial<StockLevelInput> = {}): StockLevelInput {
  return {
    id: 'ing-1',
    name: 'Flour',
    current_qty: 100,
    reorder_level: 20,
    is_active: true,
    ...overrides,
  }
}

describe('evaluateStockLevel', () => {
  it('reports ok when stock is above the reorder level', () => {
    expect(evaluateStockLevel(ingredient({ current_qty: 100, reorder_level: 20 }))).toBe('ok')
  })

  it('reports low when stock is exactly at the reorder level', () => {
    // At the line counts as low: the reorder level is the point at which the
    // merchant wanted to be told, not the point after it.
    expect(evaluateStockLevel(ingredient({ current_qty: 20, reorder_level: 20 }))).toBe('low')
  })

  it('reports low when stock is below the reorder level but still positive', () => {
    expect(evaluateStockLevel(ingredient({ current_qty: 5, reorder_level: 20 }))).toBe('low')
  })

  it('reports out when stock reaches zero', () => {
    expect(evaluateStockLevel(ingredient({ current_qty: 0, reorder_level: 20 }))).toBe('out')
  })

  it('reports out when stock has gone negative', () => {
    // Stock goes negative when a sale lands before its delivery is recorded.
    // That is more out-of-stock than zero, not less.
    expect(evaluateStockLevel(ingredient({ current_qty: -3, reorder_level: 20 }))).toBe('out')
  })

  it('reports out at zero even when no reorder level is set', () => {
    expect(evaluateStockLevel(ingredient({ current_qty: 0, reorder_level: 0 }))).toBe('out')
  })

  it('never reports low when no reorder level is set', () => {
    // A reorder level of 0 means the merchant never set one. Treating it as a
    // threshold would flag every ingredient the moment tracking is switched on.
    expect(evaluateStockLevel(ingredient({ current_qty: 1, reorder_level: 0 }))).toBe('ok')
  })
})

describe('detectStockCrossings', () => {
  it('reports a crossing when a movement takes stock from ok to low', () => {
    const before = [ingredient({ current_qty: 25, reorder_level: 20 })]

    const crossings = detectStockCrossings(before, new Map([['ing-1', -10]]))

    expect(crossings).toEqual([
      { itemId: 'ing-1', name: 'Flour', from: 'ok', to: 'low', quantity: 15, reorderLevel: 20 },
    ])
  })

  it('reports a crossing when a movement takes stock from low to out', () => {
    const before = [ingredient({ current_qty: 5, reorder_level: 20 })]

    const crossings = detectStockCrossings(before, new Map([['ing-1', -5]]))

    expect(crossings).toHaveLength(1)
    expect(crossings[0]).toMatchObject({ from: 'low', to: 'out', quantity: 0 })
  })

  it('reports a single ok-to-out crossing when a movement skips past low', () => {
    const before = [ingredient({ current_qty: 100, reorder_level: 20 })]

    const crossings = detectStockCrossings(before, new Map([['ing-1', -100]]))

    expect(crossings).toHaveLength(1)
    expect(crossings[0]).toMatchObject({ from: 'ok', to: 'out' })
  })

  it('stays silent when stock was already low and only fell further', () => {
    // The alert for this ingredient already fired on the way in. This is the
    // whole point of crossing detection: no alert per sale for the rest of day.
    const before = [ingredient({ current_qty: 15, reorder_level: 20 })]

    expect(detectStockCrossings(before, new Map([['ing-1', -5.5]]))).toEqual([])
  })

  it('stays silent when stock was already out and went further negative', () => {
    const before = [ingredient({ current_qty: 0, reorder_level: 20 })]

    expect(detectStockCrossings(before, new Map([['ing-1', -2]]))).toEqual([])
  })

  it('stays silent when a delivery lifts stock back out of low', () => {
    // Recovery is not an alert. Upward crossings are deliberately unreported.
    const before = [ingredient({ current_qty: 5, reorder_level: 20 })]

    expect(detectStockCrossings(before, new Map([['ing-1', 100]]))).toEqual([])
  })

  it('stays silent when a movement leaves the level unchanged', () => {
    const before = [ingredient({ current_qty: 100, reorder_level: 20 })]

    expect(detectStockCrossings(before, new Map([['ing-1', -10]]))).toEqual([])
  })

  it('ignores ingredients no movement touched', () => {
    const before = [
      ingredient({ id: 'ing-1', current_qty: 25, reorder_level: 20 }),
      ingredient({ id: 'ing-2', name: 'Sugar', current_qty: 21, reorder_level: 20 }),
    ]

    const crossings = detectStockCrossings(before, new Map([['ing-1', -10]]))

    expect(crossings.map((c) => c.itemId)).toEqual(['ing-1'])
  })

  it('ignores inactive ingredients', () => {
    // An archived ingredient is not something the merchant can act on.
    const before = [ingredient({ current_qty: 25, reorder_level: 20, is_active: false })]

    expect(detectStockCrossings(before, new Map([['ing-1', -10]]))).toEqual([])
  })

  it('ignores a delta naming an ingredient it was not given', () => {
    expect(detectStockCrossings([], new Map([['ghost', -10]]))).toEqual([])
  })

  it('reports every ingredient one order pushed over its line', () => {
    const before = [
      ingredient({ id: 'ing-1', name: 'Flour', current_qty: 25, reorder_level: 20 }),
      ingredient({ id: 'ing-2', name: 'Sugar', current_qty: 3, reorder_level: 10 }),
      ingredient({ id: 'ing-3', name: 'Salt', current_qty: 500, reorder_level: 10 }),
    ]

    const crossings = detectStockCrossings(
      before,
      new Map([
        ['ing-1', -10],
        ['ing-2', -3],
        ['ing-3', -5],
      ]),
    )

    expect(crossings).toEqual([
      { itemId: 'ing-1', name: 'Flour', from: 'ok', to: 'low', quantity: 15, reorderLevel: 20 },
      { itemId: 'ing-2', name: 'Sugar', from: 'low', to: 'out', quantity: 0, reorderLevel: 10 },
    ])
  })

  it('does not treat a rounding-scale residue as remaining stock', () => {
    // NUMERIC(16,4) round-trips leave dust like 1e-13. Reading that as "still
    // in stock" would keep an exhausted ingredient out of the out bucket.
    const before = [ingredient({ current_qty: 5, reorder_level: 20 })]

    const crossings = detectStockCrossings(before, new Map([['ing-1', -4.99999999999]]))

    expect(crossings[0]).toMatchObject({ to: 'out' })
  })
})
