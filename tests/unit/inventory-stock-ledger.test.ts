/**
 * Phase 4A — the stock movement ledger.
 *
 * `inventory_items.current_qty` has existed since the Phase A migration and has
 * never been written by anything: the column was created early to avoid a table
 * rewrite, and the comment still says "Phase B (created now, unused until
 * then)". Nothing receives stock, nothing counts it, nothing spends it.
 *
 * These tests pin the arithmetic that every writer — a manual receive today, an
 * order depletion in Phase 4B/4C — has to agree on. It is pure on purpose: a
 * signing or conversion mistake here silently corrupts stock for every tenant,
 * and it is the one part that can be proven without a database.
 */

import {
  resolveMovementDelta,
  movingAverageUnitCost,
  type StockMovementReason,
} from '@/lib/inventory/stock-ledger'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

const GRAM: InventoryUnit = {
  id: 'g', name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1,
}
const KILO: InventoryUnit = {
  id: 'kg', name: 'Kilogram', abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000,
}

const delta = (reason: StockMovementReason, quantity: number, currentQty = 0, unit = GRAM) =>
  resolveMovementDelta({ reason, quantity, unit, stockUnit: GRAM, currentQty })

describe('resolveMovementDelta', () => {
  it('adds stock when a delivery is received', () => {
    expect(delta('receive', 500)).toBe(500)
  })

  it('removes stock when something is wasted', () => {
    // Waste is entered as a positive amount by the merchant — "I threw away
    // 200g" — and the sign is the ledger's job, not the form's.
    expect(delta('waste', 200)).toBe(-200)
  })

  it('removes stock when an order consumes it', () => {
    expect(delta('sale', 30)).toBe(-30)
  })

  it('returns stock when an order is voided', () => {
    expect(delta('void', 30)).toBe(30)
  })

  it('reconciles a stocktake against what the system thought it had', () => {
    // Arrange: the system believes 800g remain; the merchant counts 750g.
    // Act / Assert: the ledger records the 50g discrepancy, not the count.
    expect(delta('stocktake', 750, 800)).toBe(-50)
  })

  it('records a positive correction when a count comes in higher', () => {
    expect(delta('stocktake', 900, 800)).toBe(100)
  })

  it('records nothing when a count matches exactly', () => {
    expect(delta('stocktake', 800, 800)).toBe(0)
  })

  it('converts the entered unit into the stock unit before signing', () => {
    // A merchant receives "2 kg" of an ingredient stocked in grams.
    expect(delta('receive', 2, 0, KILO)).toBe(2000)
  })

  it('converts a stocktake count into the stock unit too', () => {
    // 1kg counted against 1200g on hand → 200g short, not 1199.
    expect(delta('stocktake', 1, 1200, KILO)).toBe(-200)
  })

  it('refuses a unit from another dimension rather than inventing a number', () => {
    const litre: InventoryUnit = {
      id: 'l', name: 'Litre', abbreviation: 'L', dimension: 'volume', to_base_factor: 1000,
    }
    expect(() =>
      resolveMovementDelta({
        reason: 'receive', quantity: 1, unit: litre, stockUnit: GRAM, currentQty: 0,
      }),
    ).toThrow()
  })

  it('refuses a negative quantity, which would flip the sign of the reason', () => {
    // "-200g of waste" would silently *add* stock. The reason carries the
    // direction; the quantity is always a magnitude.
    expect(() => delta('waste', -200)).toThrow()
  })
})

describe('movingAverageUnitCost', () => {
  it('blends the new delivery price into the price of what is already on hand', () => {
    // Arrange: 100g at ₱1.00, receiving 100g at ₱2.00.
    // Act
    const cost = movingAverageUnitCost({
      currentQty: 100, currentUnitCost: 1, receivedQty: 100, receivedUnitCost: 2,
    })

    // Assert: ₱1.50, not ₱2.00 — the older, cheaper stock is still there.
    expect(cost).toBeCloseTo(1.5)
  })

  it('takes the delivery price outright when nothing was on hand', () => {
    expect(
      movingAverageUnitCost({
        currentQty: 0, currentUnitCost: 5, receivedQty: 100, receivedUnitCost: 2,
      }),
    ).toBe(2)
  })

  it('weights by quantity, not by number of deliveries', () => {
    // 900g at ₱1 plus 100g at ₱11 is ₱2/g, not ₱6/g.
    const cost = movingAverageUnitCost({
      currentQty: 900, currentUnitCost: 1, receivedQty: 100, receivedUnitCost: 11,
    })
    expect(cost).toBeCloseTo(2)
  })

  it('ignores negative on-hand stock rather than skewing the average', () => {
    // Stock can go negative when a sale is recorded before its delivery. Using
    // it as a weight would produce a nonsense — even negative — unit cost.
    const cost = movingAverageUnitCost({
      currentQty: -50, currentUnitCost: 1, receivedQty: 100, receivedUnitCost: 3,
    })
    expect(cost).toBe(3)
  })
})
