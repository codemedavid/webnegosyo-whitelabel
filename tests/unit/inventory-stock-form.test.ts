/**
 * Phase 4A — validating what a merchant types into the stock dialog.
 *
 * The form only sends a magnitude, a unit and a reason. The signed delta is
 * computed server-side from the item's *current* quantity, because the client's
 * copy can be stale — two staff receiving stock on two tills would otherwise
 * each write a total based on what they last saw.
 */

import { stockMovementInputSchema } from '@/lib/inventory/schemas'
import {
  EMPTY_STOCK_DRAFT,
  buildStockMovementInput,
  type StockMovementDraft,
} from '@/lib/inventory/stock-form'

const UUID_ITEM = '11111111-1111-4111-8111-111111111111'
const UUID_UNIT = '22222222-2222-4222-8222-222222222222'

const draft = (over: Partial<StockMovementDraft>): StockMovementDraft => ({
  ...EMPTY_STOCK_DRAFT,
  reason: 'receive',
  quantity: '10',
  unit_id: UUID_UNIT,
  ...over,
})

describe('buildStockMovementInput', () => {
  it('carries a delivery through with its unit cost', () => {
    // Arrange / Act
    const input = buildStockMovementInput(draft({ quantity: '25', unit_cost: '3.50' }), UUID_ITEM)

    // Assert
    expect(input).toMatchObject({
      inventory_item_id: UUID_ITEM,
      reason: 'receive',
      quantity: 25,
      unit_id: UUID_UNIT,
      unit_cost: 3.5,
    })
  })

  it('omits the unit cost when the merchant left it blank', () => {
    // A blank price must not be read as "this delivery was free" — that would
    // drag the weighted-average cost toward zero.
    const input = buildStockMovementInput(draft({ unit_cost: '' }), UUID_ITEM)

    expect(input.unit_cost).toBeUndefined()
  })

  it('keeps a note for the audit trail', () => {
    const input = buildStockMovementInput(draft({ note: '  spoiled overnight ' }), UUID_ITEM)

    expect(input.note).toBe('spoiled overnight')
  })

  it('rejects a blank quantity rather than recording a zero movement', () => {
    expect(() => buildStockMovementInput(draft({ quantity: '' }), UUID_ITEM)).toThrow()
  })

  it('rejects a negative quantity — the reason sets the direction', () => {
    expect(() => buildStockMovementInput(draft({ quantity: '-5' }), UUID_ITEM)).toThrow()
  })

  it('allows a zero count, which is how a merchant records running out', () => {
    const input = buildStockMovementInput(
      draft({ reason: 'stocktake', quantity: '0' }),
      UUID_ITEM,
    )

    expect(input.quantity).toBe(0)
  })

  it('rejects a movement with no unit, which could not be converted', () => {
    expect(() => buildStockMovementInput(draft({ unit_id: '' }), UUID_ITEM)).toThrow()
  })
})

describe('stockMovementInputSchema', () => {
  it('rejects a reason the ledger does not know', () => {
    expect(() =>
      stockMovementInputSchema.parse({
        inventory_item_id: UUID_ITEM, reason: 'shrinkage', quantity: 1, unit_id: UUID_UNIT,
      }),
    ).toThrow()
  })

  it('accepts the depletion reasons written by order processing', () => {
    // Phase 4B/4C write these; the schema has to admit them now so the two
    // paths cannot drift apart.
    for (const reason of ['sale', 'void'] as const) {
      expect(() =>
        stockMovementInputSchema.parse({
          inventory_item_id: UUID_ITEM, reason, quantity: 1, unit_id: UUID_UNIT,
        }),
      ).not.toThrow()
    }
  })
})
