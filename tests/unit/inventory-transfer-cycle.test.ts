/**
 * A transfer, end to end, as arithmetic over the whole chain.
 *
 * `inventory-stock-transfers-service.test.ts` already checks each leg on its
 * own — the send deducts, the receive credits, a shortfall is charged to the
 * sender. What no test asserts is the property that only exists once the legs
 * are composed: **what a completed transfer does to the store's total.**
 *
 * That total is `inventory_items.current_qty`, the roll-up every owner-facing
 * screen reads. A transfer must not move it, because the chain still owns the
 * same flour — it has merely changed shelves. An off-by-one in either leg would
 * leave every leg individually plausible and quietly create or destroy stock at
 * the chain level, which is the one error this system cannot self-detect: there
 * is no second source of truth to disagree with.
 *
 * These sum the movement deltas rather than mock a database. The trigger owns
 * the balances; what this file pins is the arithmetic handed to it. The
 * database half — that the trigger and the roll-up actually agree with these
 * sums — was confirmed by the live probe recorded in the phase E evidence
 * report.
 */

import {
  buildSendMovements,
  buildReceiveMovements,
  type TransferMovement,
} from '@/lib/inventory/stock-transfer'

const SOURCE = 'outlet-north'
const DEST = 'outlet-south'

/** What the whole chain gains or loses: every branch's delta added together. */
function chainDelta(movements: readonly TransferMovement[]): number {
  return movements.reduce((total, movement) => total + movement.quantityDelta, 0)
}

/** What one shelf gains or loses. */
function branchDelta(movements: readonly TransferMovement[], outletId: string | null): number {
  return movements
    .filter((movement) => movement.outletId === outletId)
    .reduce((total, movement) => total + movement.quantityDelta, 0)
}

/** Send `sent`, then count `received` in at the far end. */
function fullCycle(sent: number, received: number): TransferMovement[] {
  const lines = [{ inventoryItemId: 'flour', sentQuantity: sent, receivedQuantity: received }]
  return [
    ...buildSendMovements({ fromOutletId: SOURCE, lines }),
    ...buildReceiveMovements({ fromOutletId: SOURCE, toOutletId: DEST, lines }),
  ]
}

describe('a transfer that arrives intact', () => {
  it('leaves the chain holding exactly what it held before', () => {
    expect(chainDelta(fullCycle(30, 30))).toBe(0)
  })

  it('moves the stock from one shelf to the other', () => {
    const cycle = fullCycle(30, 30)

    expect(branchDelta(cycle, SOURCE)).toBe(-30)
    expect(branchDelta(cycle, DEST)).toBe(30)
  })

  it('writes nothing accusing anyone of a loss', () => {
    // A zero-quantity waste row on every clean transfer would drown the real
    // ones, which is the whole reason shrinkage is worth recording at all.
    expect(fullCycle(30, 30).some((movement) => movement.reason === 'waste')).toBe(false)
  })
})

describe('a transfer that arrives short', () => {
  it('costs the chain the shortfall once, not twice', () => {
    // The hazard this guards: the send leg has already taken the stock off the
    // source shelf, so a bare waste leg would deduct the same missing units a
    // second time and an 8-unit shortfall would read as a 16-unit loss.
    expect(chainDelta(fullCycle(20, 12))).toBe(-8)
  })

  it('charges the loss to the branch that loaded the van', () => {
    const cycle = fullCycle(20, 12)

    // -20 out, +8 back on the books, -8 written off.
    expect(branchDelta(cycle, SOURCE)).toBe(-20)
    // The receiver is credited only with what they actually counted.
    expect(branchDelta(cycle, DEST)).toBe(12)
  })
})

describe('a transfer that never turns up', () => {
  it('writes the whole load off against the sender', () => {
    // The only way to close a sent transfer, since `sent` cannot be cancelled.
    expect(chainDelta(fullCycle(20, 0))).toBe(-20)
  })

  it('credits the destination with nothing rather than with zero', () => {
    const cycle = fullCycle(20, 0)

    expect(cycle.filter((movement) => movement.outletId === DEST)).toHaveLength(0)
  })
})

describe('the store pool as an endpoint', () => {
  it('nets to zero moving stock out of the unbranched pool', () => {
    // Every single-shop tenant's stock lives at `null`, so the pool is an
    // ordinary endpoint rather than a special case.
    const lines = [{ inventoryItemId: 'flour', sentQuantity: 15, receivedQuantity: 15 }]
    const cycle = [
      ...buildSendMovements({ fromOutletId: null, lines }),
      ...buildReceiveMovements({ fromOutletId: null, toOutletId: DEST, lines }),
    ]

    expect(chainDelta(cycle)).toBe(0)
    expect(branchDelta(cycle, null)).toBe(-15)
    expect(branchDelta(cycle, DEST)).toBe(15)
  })
})

describe('a count that cannot be true', () => {
  it('refuses to receive more than was sent, creating nothing', () => {
    expect(() => fullCycle(10, 11)).toThrow('You cannot receive more than was sent')
  })
})
