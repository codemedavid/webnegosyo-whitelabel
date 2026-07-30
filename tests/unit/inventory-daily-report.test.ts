/**
 * Phase 1 — the daily inventory report.
 *
 * Two questions a merchant cannot answer today:
 *   1. "Did today's sales cover the ingredients today consumed?" — COGS.
 *   2. "When we counted this morning, did the shelf match what the POS says we
 *      sold?" — variance, and the loss it represents, shrinkage.
 *
 * Both are already in the ledger and have simply never been read that way.
 * `sale` rows ARE theoretical usage: they are derived from recipes, never from
 * counting, which is exactly what "theoretical" means in the trade. And a
 * stocktake already stores the DISCREPANCY as its delta — so the variance is
 * written down, it just has no reader.
 *
 * This module is pure: no dates are formatted and no database is touched, so
 * the merchant app can render the same report from the same rules.
 */

import {
  buildDailyInventoryReport,
  type DailyReportIngredient,
  type DailyReportMovement,
} from '@/lib/inventory/daily-report'

const FLOUR: DailyReportIngredient = {
  id: 'flour',
  name: 'Flour',
  unitCost: 0.05,
  stockUnitAbbreviation: 'g',
}

const BEEF: DailyReportIngredient = {
  id: 'beef',
  name: 'Beef',
  unitCost: 0.4,
  stockUnitAbbreviation: 'g',
}

/** `balanceAfter` is the running total the trigger wrote, so it is never guessed. */
function movement(
  partial: Partial<DailyReportMovement> & Pick<DailyReportMovement, 'reason' | 'quantityDelta' | 'balanceAfter'>,
): DailyReportMovement {
  return {
    inventoryItemId: 'flour',
    createdAt: '2026-07-29T02:00:00.000Z',
    ...partial,
  }
}

describe('buildDailyInventoryReport — the reconciliation', () => {
  test('opens at the balance before the first movement, not at zero', () => {
    // Arrange — the day started with 1000 g and a delivery took it to 1500.
    const movements = [movement({ reason: 'receive', quantityDelta: 500, balanceAfter: 1500 })]

    // Act
    const report = buildDailyInventoryReport({ movements, ingredients: [FLOUR] })

    // Assert — opening is derived from the row itself, so no extra query and no
    // disagreement with the ledger.
    expect(report.rows[0].opening).toBe(1000)
    expect(report.rows[0].closing).toBe(1500)
  })

  test('reconciles opening + received - sold - waste +/- count into closing', () => {
    // Arrange — a full day on one ingredient.
    const movements = [
      movement({ reason: 'receive', quantityDelta: 500, balanceAfter: 1500 }),
      movement({ reason: 'sale', quantityDelta: -200, balanceAfter: 1300 }),
      movement({ reason: 'waste', quantityDelta: -100, balanceAfter: 1200 }),
      movement({ reason: 'stocktake', quantityDelta: -50, balanceAfter: 1150 }),
    ]

    // Act
    const [row] = buildDailyInventoryReport({ movements, ingredients: [FLOUR] }).rows

    // Assert
    expect(row).toMatchObject({
      opening: 1000,
      received: 500,
      sold: 200,
      waste: 100,
      countAdjustment: -50,
      closing: 1150,
    })
    // The identity that makes the report trustworthy at a glance.
    expect(row.opening + row.received - row.sold - row.waste + row.countAdjustment).toBeCloseTo(
      row.closing,
      8,
    )
  })

  test('a void nets off the sale it reverses rather than counting as usage', () => {
    // Arrange — sold 200 g, then the order was cancelled.
    const movements = [
      movement({ reason: 'sale', quantityDelta: -200, balanceAfter: 800 }),
      movement({ reason: 'void', quantityDelta: 200, balanceAfter: 1000 }),
    ]

    // Act
    const [row] = buildDailyInventoryReport({ movements, ingredients: [FLOUR] }).rows

    // Assert — a cancelled order consumed nothing, so theoretical usage is zero.
    expect(row.sold).toBe(0)
  })

  test('reports usage as a positive magnitude even though the ledger is signed', () => {
    // Arrange — "sold 200" reads better than "sold -200" on every screen.
    const movements = [movement({ reason: 'sale', quantityDelta: -200, balanceAfter: 800 })]

    // Act
    const [row] = buildDailyInventoryReport({ movements, ingredients: [FLOUR] }).rows

    // Assert
    expect(row.sold).toBe(200)
    expect(row.waste).toBe(0)
  })
})

describe('buildDailyInventoryReport — what it costs', () => {
  test('values theoretical usage at the ingredient cost to give COGS', () => {
    // Arrange — 200 g of flour at ₱0.05/g.
    const movements = [movement({ reason: 'sale', quantityDelta: -200, balanceAfter: 800 })]

    // Act
    const report = buildDailyInventoryReport({ movements, ingredients: [FLOUR] })

    // Assert
    expect(report.rows[0].cogs).toBeCloseTo(10, 8)
    expect(report.totals.cogs).toBeCloseTo(10, 8)
  })

  test('values waste separately from sales, because they are different problems', () => {
    // Arrange
    const movements = [
      movement({ reason: 'sale', quantityDelta: -200, balanceAfter: 800 }),
      movement({ reason: 'waste', quantityDelta: -100, balanceAfter: 700 }),
    ]

    // Act
    const report = buildDailyInventoryReport({ movements, ingredients: [FLOUR] })

    // Assert — waste is a controllable loss; COGS is the cost of doing business.
    expect(report.rows[0].cogs).toBeCloseTo(10, 8)
    expect(report.rows[0].wasteCost).toBeCloseTo(5, 8)
    expect(report.totals.wasteCost).toBeCloseTo(5, 8)
  })

  test('a short count is shrinkage, valued as a positive loss', () => {
    // Arrange — the shelf held 50 g less than the ledger expected.
    const movements = [movement({ reason: 'stocktake', quantityDelta: -50, balanceAfter: 950 })]

    // Act
    const report = buildDailyInventoryReport({ movements, ingredients: [FLOUR] })

    // Assert — shrinkage is stated as money lost, so 50 g short is ₱2.50 lost.
    expect(report.rows[0].shrinkage).toBe(50)
    expect(report.rows[0].shrinkageCost).toBeCloseTo(2.5, 8)
    expect(report.totals.shrinkageCost).toBeCloseTo(2.5, 8)
  })

  test('a long count is not shrinkage — it is a different fault', () => {
    // Arrange — more on the shelf than expected. Real, but it is not a loss, and
    // reporting it as negative shrinkage would net out a real loss elsewhere.
    const movements = [movement({ reason: 'stocktake', quantityDelta: 30, balanceAfter: 1030 })]

    // Act
    const report = buildDailyInventoryReport({ movements, ingredients: [FLOUR] })

    // Assert
    expect(report.rows[0].countAdjustment).toBe(30)
    expect(report.rows[0].shrinkage).toBe(0)
    expect(report.totals.shrinkageCost).toBe(0)
  })
})

describe('buildDailyInventoryReport — what it shows and in what order', () => {
  test('ranks by peso shrinkage, not percentage', () => {
    // Arrange — flour is short by a larger PROPORTION, beef by more MONEY.
    // Chasing the percentage sends the merchant after garlic while the beef
    // walks out of the door.
    const movements = [
      movement({ inventoryItemId: 'flour', reason: 'stocktake', quantityDelta: -100, balanceAfter: 900 }),
      movement({ inventoryItemId: 'beef', reason: 'stocktake', quantityDelta: -50, balanceAfter: 450 }),
    ]

    // Act
    const report = buildDailyInventoryReport({ movements, ingredients: [FLOUR, BEEF] })

    // Assert — beef: 50 x ₱0.40 = ₱20. flour: 100 x ₱0.05 = ₱5.
    expect(report.rows.map((r) => r.name)).toEqual(['Beef', 'Flour'])
  })

  test('leaves out ingredients that did not move at all', () => {
    // Arrange — a quiet ingredient is noise on a daily report.
    const movements = [movement({ reason: 'sale', quantityDelta: -200, balanceAfter: 800 })]

    // Act
    const report = buildDailyInventoryReport({ movements, ingredients: [FLOUR, BEEF] })

    // Assert
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].name).toBe('Flour')
  })

  test('keeps an ingredient that was counted and found correct', () => {
    // Arrange — a zero-variance count is the most reassuring line on the report
    // and the one a merchant most wants to see.
    const movements = [movement({ reason: 'stocktake', quantityDelta: 0, balanceAfter: 1000 })]

    // Act
    const report = buildDailyInventoryReport({ movements, ingredients: [FLOUR] })

    // Assert
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].wasCounted).toBe(true)
    expect(report.rows[0].shrinkage).toBe(0)
  })

  test('says which ingredients were never counted, so a clean report is not mistaken for a checked one', () => {
    // Arrange — flour was counted, beef was not.
    const movements = [
      movement({ inventoryItemId: 'flour', reason: 'stocktake', quantityDelta: 0, balanceAfter: 1000 }),
      movement({ inventoryItemId: 'beef', reason: 'sale', quantityDelta: -50, balanceAfter: 450 }),
    ]

    // Act
    const report = buildDailyInventoryReport({ movements, ingredients: [FLOUR, BEEF] })

    // Assert — zero shrinkage on an uncounted shelf means "nobody looked",
    // not "nothing is missing".
    expect(report.uncountedCount).toBe(1)
    expect(report.countedCount).toBe(1)
  })

  test('an ingredient with no cost recorded contributes no money, only quantities', () => {
    // Arrange — costing an unpriced ingredient at zero understates COGS, so the
    // report has to say the figure is incomplete rather than quietly be wrong.
    const uncosted: DailyReportIngredient = { ...FLOUR, unitCost: 0 }
    const movements = [movement({ reason: 'sale', quantityDelta: -200, balanceAfter: 800 })]

    // Act
    const report = buildDailyInventoryReport({ movements, ingredients: [uncosted] })

    // Assert
    expect(report.rows[0].sold).toBe(200)
    expect(report.rows[0].cogs).toBe(0)
    expect(report.uncostedCount).toBe(1)
  })

  test('a movement for an unknown ingredient is dropped, not crashed on', () => {
    // Arrange — a deleted ingredient leaves its ledger rows behind.
    const movements = [
      movement({ inventoryItemId: 'ghost', reason: 'sale', quantityDelta: -10, balanceAfter: 0 }),
    ]

    // Act
    const report = buildDailyInventoryReport({ movements, ingredients: [FLOUR] })

    // Assert
    expect(report.rows).toEqual([])
    expect(report.totals.cogs).toBe(0)
  })

  test('an empty day reports nothing rather than zeroes', () => {
    // Act
    const report = buildDailyInventoryReport({ movements: [], ingredients: [FLOUR] })

    // Assert
    expect(report.rows).toEqual([])
    expect(report.totals).toMatchObject({ cogs: 0, wasteCost: 0, shrinkageCost: 0 })
  })
})

describe('buildDailyInventoryReport — ordering of the ledger', () => {
  test('reads opening and closing from time order, not array order', () => {
    // Arrange — the ledger is usually read newest-first, and taking the first
    // row as the opening would invert the whole day.
    const movements = [
      movement({ reason: 'waste', quantityDelta: -100, balanceAfter: 1200, createdAt: '2026-07-29T09:00:00.000Z' }),
      movement({ reason: 'receive', quantityDelta: 300, balanceAfter: 1300, createdAt: '2026-07-29T02:00:00.000Z' }),
    ]

    // Act
    const [row] = buildDailyInventoryReport({ movements, ingredients: [FLOUR] }).rows

    // Assert
    expect(row.opening).toBe(1000)
    expect(row.closing).toBe(1200)
  })
})
