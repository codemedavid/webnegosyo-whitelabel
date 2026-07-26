/**
 * Phase 4D — reading the ledger back.
 *
 * The ledger has been recording faithfully since Phase 4A and displaying
 * nothing. "Why is this number wrong?" has only been answerable in SQL, which
 * defeats most of the point of keeping an audit trail.
 *
 * The presentation rule that matters here: the number shown must reconcile with
 * the balance beside it. A movement entered as 0.6 kg against an ingredient
 * stocked in grams moved the balance by 600, and showing "0.6" next to a
 * balance in grams invites "these don't add up". So the stock-unit delta leads,
 * and what the merchant actually typed is carried alongside it.
 */

import { toStockHistoryEntry } from '@/lib/inventory/stock-history'
import type { StockMovement } from '@/types/database'

const GRAM_ID = 'unit-g'
const KILO_ID = 'unit-kg'

const ABBREVIATIONS: Record<string, string> = { [GRAM_ID]: 'g', [KILO_ID]: 'kg' }

const CONTEXT = {
  stockUnitId: GRAM_ID,
  unitAbbreviation: (unitId: string) => ABBREVIATIONS[unitId] ?? '',
}

const movement = (over: Partial<StockMovement>): StockMovement => ({
  id: 'mv-1',
  tenant_id: 't1',
  inventory_item_id: 'ing-1',
  reason: 'receive',
  quantity_delta: 500,
  entered_quantity: 500,
  entered_unit_id: GRAM_ID,
  balance_after: 1300,
  created_at: '2026-07-26T02:00:00.000Z',
  ...over,
})

describe('toStockHistoryEntry', () => {
  it('signs an incoming movement with a plus', () => {
    // Arrange
    const mv = movement({ reason: 'receive', quantity_delta: 500 })

    // Act
    const entry = toStockHistoryEntry(mv, CONTEXT)

    // Assert
    expect(entry.quantityLabel).toBe('+500 g')
    expect(entry.direction).toBe('in')
  })

  it('signs an outgoing movement with a minus', () => {
    const entry = toStockHistoryEntry(movement({ reason: 'sale', quantity_delta: -160 }), CONTEXT)

    expect(entry.quantityLabel).toBe('-160 g')
    expect(entry.direction).toBe('out')
  })

  it('shows a zero-delta stocktake without a sign', () => {
    // A count that confirms the figure is a real, meaningful ledger row — it
    // says "someone checked" — and rendering it as "+0" or "-0" reads as noise.
    const entry = toStockHistoryEntry(movement({ reason: 'stocktake', quantity_delta: 0 }), CONTEXT)

    expect(entry.quantityLabel).toBe('0 g')
    expect(entry.direction).toBe('none')
  })

  it('leads with the stock-unit delta so it reconciles with the balance', () => {
    // Entered as 0.6 kg, stocked in grams: the balance moved by 600.
    const entry = toStockHistoryEntry(
      movement({ quantity_delta: 600, entered_quantity: 0.6, entered_unit_id: KILO_ID }),
      CONTEXT,
    )

    expect(entry.quantityLabel).toBe('+600 g')
    expect(entry.enteredLabel).toBe('entered 0.6 kg')
  })

  it('omits the entered figure when it says nothing new', () => {
    const entry = toStockHistoryEntry(
      movement({ quantity_delta: 500, entered_quantity: 500, entered_unit_id: GRAM_ID }),
      CONTEXT,
    )

    expect(entry.enteredLabel).toBeNull()
  })

  it('omits the entered figure for movements that never recorded one', () => {
    // Rows written before `entered_quantity` existed, and any writer that only
    // knows the delta.
    const entry = toStockHistoryEntry(
      movement({ entered_quantity: null, entered_unit_id: null }),
      CONTEXT,
    )

    expect(entry.enteredLabel).toBeNull()
  })

  it("labels the reason in the merchant's words", () => {
    expect(toStockHistoryEntry(movement({ reason: 'waste' }), CONTEXT).reasonLabel).toBe('Wasted')
    expect(toStockHistoryEntry(movement({ reason: 'void' }), CONTEXT).reasonLabel).toBe(
      'Order voided',
    )
  })

  it('trims the trailing zeros a NUMERIC round-trip leaves behind', () => {
    const entry = toStockHistoryEntry(
      movement({ quantity_delta: -160.0, balance_after: 840.0 }),
      CONTEXT,
    )

    expect(entry.quantityLabel).toBe('-160 g')
    expect(entry.balanceLabel).toBe('840 g')
  })

  it('carries the note through and null when there is none', () => {
    expect(toStockHistoryEntry(movement({ note: 'Delivery #42' }), CONTEXT).note).toBe(
      'Delivery #42',
    )
    expect(toStockHistoryEntry(movement({ note: null }), CONTEXT).note).toBeNull()
  })

  it('keeps the timestamp raw rather than formatting it', () => {
    // Formatting a date where a server render can see it is a hydration bug —
    // the server and the browser disagree on locale and timezone. The caller
    // formats, and only on the client.
    const entry = toStockHistoryEntry(movement({}), CONTEXT)

    expect(entry.createdAt).toBe('2026-07-26T02:00:00.000Z')
  })

  it('marks a movement that came from an order', () => {
    // So a merchant can tell "the system took this" from "I typed this".
    const entry = toStockHistoryEntry(movement({ reason: 'sale', order_id: 'ord-1' }), CONTEXT)

    expect(entry.isAutomatic).toBe(true)
    expect(toStockHistoryEntry(movement({ order_id: null }), CONTEXT).isAutomatic).toBe(false)
  })
})
