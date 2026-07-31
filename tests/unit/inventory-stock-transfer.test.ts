/**
 * Moving stock between branches.
 *
 * The owner's cross-branch panel names a direction — North → South — and this
 * is the thing that performs it. A transfer is the one operation that touches
 * two shelves at once, so the arithmetic is where stock can be created or
 * destroyed by accident, and it is tested apart from the database.
 *
 * The rule under all of it: every leg is a real ledger movement. Nothing here
 * swaps quantities between rows, because a swap leaves no trace of who moved
 * what and the ledger is the only reason "why is this number wrong?" is an
 * answerable question.
 */

import {
  canTransitionTransfer,
  assertTransferTransition,
  validateTransferDraft,
  buildSendMovements,
  buildReceiveMovements,
  TRANSFER_STATUS_LABELS,
  type TransferLineDraft,
  type TransferLineReceipt,
} from '@/lib/inventory/stock-transfer'

const line = (overrides: Partial<TransferLineDraft> = {}): TransferLineDraft => ({
  inventoryItemId: 'item-flour',
  quantity: 10,
  ...overrides,
})

const receipt = (overrides: Partial<TransferLineReceipt> = {}): TransferLineReceipt => ({
  inventoryItemId: 'item-flour',
  sentQuantity: 10,
  receivedQuantity: 10,
  unitCost: 25,
  ...overrides,
})

describe('transfer state machine', () => {
  it('walks draft → sent → received', () => {
    expect(canTransitionTransfer('draft', 'sent')).toBe(true)
    expect(canTransitionTransfer('sent', 'received')).toBe(true)
  })

  it('refuses to receive a transfer that was never sent', () => {
    // Receiving writes stock INTO the destination. Allowing it from draft would
    // credit a shelf with goods that never left the other one.
    expect(canTransitionTransfer('draft', 'received')).toBe(false)
    expect(() => assertTransferTransition('draft', 'received')).toThrow()
  })

  it('refuses to send a transfer twice', () => {
    expect(canTransitionTransfer('sent', 'sent')).toBe(false)
  })

  it('refuses to touch a transfer that is already received', () => {
    expect(canTransitionTransfer('received', 'sent')).toBe(false)
    expect(canTransitionTransfer('received', 'cancelled')).toBe(false)
  })

  it('allows cancelling only before the stock has left', () => {
    // Once sent, the stock is off the source shelf and a status flip would not
    // put it back. A transfer that never arrives is closed by receiving zero,
    // which posts the loss as shrinkage against the sender — one reversal path
    // rather than two that must agree.
    expect(canTransitionTransfer('draft', 'cancelled')).toBe(true)
    expect(canTransitionTransfer('sent', 'cancelled')).toBe(false)
  })

  it('names every status for the merchant', () => {
    expect(Object.keys(TRANSFER_STATUS_LABELS).sort()).toEqual([
      'cancelled',
      'draft',
      'received',
      'sent',
    ])
  })
})

describe('validateTransferDraft', () => {
  it('accepts a transfer between two different branches', () => {
    expect(() =>
      validateTransferDraft({
        fromOutletId: 'o-north',
        toOutletId: 'o-south',
        lines: [line()],
      }),
    ).not.toThrow()
  })

  it('refuses a transfer to the same branch', () => {
    // Two legs against one shelf net to nothing but leave a document claiming
    // stock moved.
    expect(() =>
      validateTransferDraft({
        fromOutletId: 'o-north',
        toOutletId: 'o-north',
        lines: [line()],
      }),
    ).toThrow(/same branch/i)
  })

  it('refuses a transfer with no lines', () => {
    expect(() =>
      validateTransferDraft({ fromOutletId: 'o-north', toOutletId: 'o-south', lines: [] }),
    ).toThrow(/at least one/i)
  })

  it('refuses a line with no quantity', () => {
    expect(() =>
      validateTransferDraft({
        fromOutletId: 'o-north',
        toOutletId: 'o-south',
        lines: [line({ quantity: 0 })],
      }),
    ).toThrow(/quantity/i)
  })

  it('refuses a negative quantity rather than reversing the direction', () => {
    // A negative line would move stock the other way while the document still
    // said North → South.
    expect(() =>
      validateTransferDraft({
        fromOutletId: 'o-north',
        toOutletId: 'o-south',
        lines: [line({ quantity: -5 })],
      }),
    ).toThrow(/quantity/i)
  })

  it('refuses the same ingredient twice', () => {
    // Two lines for flour make the receiving count ambiguous.
    expect(() =>
      validateTransferDraft({
        fromOutletId: 'o-north',
        toOutletId: 'o-south',
        lines: [line(), line({ quantity: 3 })],
      }),
    ).toThrow(/once/i)
  })
})

describe('buildSendMovements', () => {
  it('takes the stock off the sending branch and nowhere else', () => {
    const movements = buildSendMovements({
      fromOutletId: 'o-north',
      lines: [receipt({ sentQuantity: 10 })],
    })

    expect(movements).toEqual([
      expect.objectContaining({
        inventoryItemId: 'item-flour',
        outletId: 'o-north',
        reason: 'transfer_out',
        quantityDelta: -10,
      }),
    ])
  })

  it('does not credit the destination until it is received', () => {
    // Stock in transit belongs to neither shelf. Crediting on send would let
    // the destination sell goods still on a van.
    const movements = buildSendMovements({
      fromOutletId: 'o-north',
      lines: [receipt()],
    })

    expect(movements).toHaveLength(1)
    expect(movements.every((m) => m.reason === 'transfer_out')).toBe(true)
  })

  it('carries the source unit cost onto the leg', () => {
    const [movement] = buildSendMovements({
      fromOutletId: 'o-north',
      lines: [receipt({ unitCost: 25 })],
    })

    expect(movement.unitCost).toBe(25)
  })
})

describe('buildReceiveMovements', () => {
  it('puts the full amount on the receiving branch when it all arrives', () => {
    const movements = buildReceiveMovements({
      fromOutletId: 'o-north',
      toOutletId: 'o-south',
      lines: [receipt({ sentQuantity: 10, receivedQuantity: 10 })],
    })

    expect(movements).toEqual([
      expect.objectContaining({
        inventoryItemId: 'item-flour',
        outletId: 'o-south',
        reason: 'transfer_in',
        quantityDelta: 10,
      }),
    ])
  })

  it('posts a shortfall as shrinkage against the SENDING branch', () => {
    // 10 left North, 8 arrived. The 2 are not the receiver's loss — they never
    // reached their shelf — and they are not still at North either. Charging
    // them to the sender is what makes the pair of branches reconcile and puts
    // the loss where the investigation has to start.
    const movements = buildReceiveMovements({
      fromOutletId: 'o-north',
      toOutletId: 'o-south',
      lines: [receipt({ sentQuantity: 10, receivedQuantity: 8 })],
    })

    expect(movements).toContainEqual(
      expect.objectContaining({
        outletId: 'o-south',
        reason: 'transfer_in',
        quantityDelta: 8,
      }),
    )
    expect(movements).toContainEqual(
      expect.objectContaining({
        outletId: 'o-north',
        reason: 'waste',
        quantityDelta: -2,
      }),
    )
  })

  it('writes no shrinkage leg when the count matches', () => {
    // A zero-quantity waste row would accuse a branch of losing nothing, on
    // every clean transfer, forever.
    const movements = buildReceiveMovements({
      fromOutletId: 'o-north',
      toOutletId: 'o-south',
      lines: [receipt({ sentQuantity: 10, receivedQuantity: 10 })],
    })

    expect(movements.some((m) => m.reason === 'waste')).toBe(false)
  })

  it('refuses to receive more than was sent', () => {
    // 12 arriving from a van that carried 10 is a counting error, and honouring
    // it would create two units of flour out of nothing.
    expect(() =>
      buildReceiveMovements({
        fromOutletId: 'o-north',
        toOutletId: 'o-south',
        lines: [receipt({ sentQuantity: 10, receivedQuantity: 12 })],
      }),
    ).toThrow(/more than/i)
  })

  it('refuses a negative received count', () => {
    expect(() =>
      buildReceiveMovements({
        fromOutletId: 'o-north',
        toOutletId: 'o-south',
        lines: [receipt({ receivedQuantity: -1 })],
      }),
    ).toThrow(/negative/i)
  })

  it('accepts a load that never arrived at all', () => {
    // Nothing arrived: no transfer_in leg to write, and the whole consignment
    // posts as shrinkage against the sender. This is how a lost transfer is
    // closed, which is why cancelling a sent transfer is refused.
    const movements = buildReceiveMovements({
      fromOutletId: 'o-north',
      toOutletId: 'o-south',
      lines: [receipt({ sentQuantity: 10, receivedQuantity: 0 })],
    })

    expect(movements).toEqual([
      expect.objectContaining({ outletId: 'o-north', reason: 'waste', quantityDelta: -10 }),
    ])
  })

  it('values the arriving stock at the source branch cost', () => {
    // The receiving branch did not buy it, so it has no price of its own to
    // apply. Anything else would move the chain's stock value on a transfer.
    const [movement] = buildReceiveMovements({
      fromOutletId: 'o-north',
      toOutletId: 'o-south',
      lines: [receipt({ unitCost: 25 })],
    })

    expect(movement.unitCost).toBe(25)
  })

  it('handles the unbranched store pool as a destination', () => {
    // A single-shop tenant that opens a second branch still has stock in the
    // pool, and moving it out of there has to be expressible.
    const movements = buildReceiveMovements({
      fromOutletId: null,
      toOutletId: 'o-south',
      lines: [receipt({ sentQuantity: 10, receivedQuantity: 9 })],
    })

    expect(movements).toContainEqual(
      expect.objectContaining({ outletId: null, reason: 'waste', quantityDelta: -1 }),
    )
  })
})
