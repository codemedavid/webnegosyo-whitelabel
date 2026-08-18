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
  describeDeliveryPriceUnit,
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

/**
 * Phase 0 — the delivery price is per the unit the merchant entered in, and the
 * server converts it to the ingredient's stock unit before storing it. The
 * dialog therefore has to name both units, because "Unit cost" beside a unit
 * dropdown reads as either one and guessing wrong is a silent 1000x error.
 *
 * The wording lives here rather than in the component because the unit
 * dropdown is a Radix `Select` that cannot be driven under jsdom — testing the
 * rule through the widget would prove less and break more.
 */
describe('describeDeliveryPriceUnit', () => {
  const perUnit = (abbrev: string) => abbrev

  test('names the entered unit in the label', () => {
    // Arrange / Act
    const described = describeDeliveryPriceUnit('kg', 'g', perUnit)

    // Assert
    expect(described.label).toMatch(/cost per kg/i)
  })

  test('says the price will be converted when the units differ', () => {
    const described = describeDeliveryPriceUnit('kg', 'g', perUnit)

    expect(described.conversionHint).toMatch(/converted to g/i)
  })

  test('says nothing about conversion when the units already match', () => {
    // Arrange — no conversion happens, so mentioning one is noise.
    const described = describeDeliveryPriceUnit('g', 'g', perUnit)

    expect(described.label).toMatch(/cost per g/i)
    expect(described.conversionHint).toBeNull()
  })

  test('falls back to the stock unit before the merchant picks one', () => {
    // Arrange — the dialog opens with no unit selected.
    const described = describeDeliveryPriceUnit('', 'g', perUnit)

    expect(described.label).toMatch(/cost per g/i)
    expect(described.conversionHint).toBeNull()
  })
})

/**
 * A count that is running should collect the entries made into it, without the
 * merchant having to remember to say so.
 *
 * If attaching were a thing to remember, the entries a busy kitchen forgets to
 * tag would leave the count reading as partial — and a coverage figure that
 * under-reports honest work is how merchants learn to ignore it.
 */
describe('buildStockMovementInput — joining the open count', () => {
  const UUID_COUNT = '33333333-3333-4333-8333-333333333333'

  it('files a stocktake under the count that is running', () => {
    const input = buildStockMovementInput(
      draft({ reason: 'stocktake', quantity: '900' }),
      UUID_ITEM,
      UUID_COUNT,
    )

    expect(input.inventory_count_id).toBe(UUID_COUNT)
  })

  it('leaves a delivery out of the count even while one is running', () => {
    // Stock still arrives mid-count. A delivery filed under the count would
    // raise coverage for an ingredient nobody counted — and the schema refuses
    // it outright, so attaching here would break the merchant's delivery form.
    const input = buildStockMovementInput(
      draft({ reason: 'receive', quantity: '10' }),
      UUID_ITEM,
      UUID_COUNT,
    )

    expect(input.inventory_count_id).toBeUndefined()
  })

  it('records a one-off stocktake when no count is running', () => {
    // The behaviour every tenant has today, and it must not change.
    const input = buildStockMovementInput(draft({ reason: 'stocktake', quantity: '900' }), UUID_ITEM)

    expect(input.inventory_count_id).toBeUndefined()
  })

  it('keeps a stocktake at another branch out of a count running on a different shelf', () => {
    // The count describes ONE shelf. A North stocktake filed under the store
    // pool's count would raise that count's coverage for a shelf nobody
    // counted — the exact reassurance the session exists to withhold.
    const NORTH = '44444444-4444-4444-8444-444444444444'
    const input = buildStockMovementInput(
      draft({ reason: 'stocktake', quantity: '900', outlet_id: NORTH }),
      UUID_ITEM,
      UUID_COUNT,
      null, // the running count is on the store pool
    )

    expect(input.inventory_count_id).toBeUndefined()
    expect(input.outlet_id).toBe(NORTH)
  })

  it('joins the count when the stocktake is on the same branch shelf', () => {
    const NORTH = '44444444-4444-4444-8444-444444444444'
    const input = buildStockMovementInput(
      draft({ reason: 'stocktake', quantity: '900', outlet_id: NORTH }),
      UUID_ITEM,
      UUID_COUNT,
      NORTH,
    )

    expect(input.inventory_count_id).toBe(UUID_COUNT)
  })
})

/**
 * Which shelf a movement lands on.
 *
 * The dialog used to send no branch at all, so every manual movement fell into
 * the store pool while order depletion wrote to the order's branch — the two
 * halves of the same ledger drifting apart on any multi-branch tenant.
 */
describe('buildStockMovementInput — naming the branch', () => {
  const UUID_NORTH = '44444444-4444-4444-8444-444444444444'

  it('threads the chosen branch through to the movement input', () => {
    const input = buildStockMovementInput(draft({ outlet_id: UUID_NORTH }), UUID_ITEM)

    expect(input.outlet_id).toBe(UUID_NORTH)
  })

  it('sends an explicit store pool when no branch is chosen — the behaviour every tenant has today', () => {
    const input = buildStockMovementInput(draft({}), UUID_ITEM)

    expect(input.outlet_id).toBeNull()
  })

  it('starts the empty draft on the store pool', () => {
    expect(EMPTY_STOCK_DRAFT.outlet_id).toBeNull()
  })
})
