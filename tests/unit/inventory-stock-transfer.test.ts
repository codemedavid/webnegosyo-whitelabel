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
  canSendTransfer,
  canReceiveTransfer,
  resolveReceiptLines,
  TRANSFER_STATUS_LABELS,
  type TransferLineDraft,
  type TransferLineReceipt,
} from '@/lib/inventory/stock-transfer'
import type { BranchScope } from '@/lib/outlets/branch-scope'

const ALL: BranchScope = { kind: 'all' }
const AT_NORTH: BranchScope = { kind: 'branch', outletId: 'o-north' }
const AT_SOUTH: BranchScope = { kind: 'branch', outletId: 'o-south' }

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
    // Nothing arrived: the receiving branch is credited with nothing, and the
    // whole consignment posts as shrinkage against the sender. This is how a
    // lost transfer is closed, which is why cancelling a sent one is refused.
    //
    // This assertion used to pin the exact leg list as the waste leg alone,
    // which is what let the double-charge through: the send leg had already
    // emptied North's shelf, so wasting the load against it took the stock off
    // the chain twice. The consignment is returned to the sender's book first
    // — see the conservation block below.
    const movements = buildReceiveMovements({
      fromOutletId: 'o-north',
      toOutletId: 'o-south',
      lines: [receipt({ sentQuantity: 10, receivedQuantity: 0 })],
    })

    expect(movements.some((m) => m.outletId === 'o-south')).toBe(false)
    expect(movements).toContainEqual(
      expect.objectContaining({ outletId: 'o-north', reason: 'waste', quantityDelta: -10 }),
    )
    expect(movements.reduce((sum, m) => sum + m.quantityDelta, 0)).toBe(0)
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

describe('a transfer conserves stock, send and receive taken together', () => {
  /**
   * Every test above this block checks one leg's shape in isolation, which is
   * how the defect below survived: each leg was individually defensible and the
   * pair of them was never added up.
   *
   * Found by probing the real branch rows on a live tenant. Opening 400 at
   * Central and 100 at Valenzuela, sending 120 and receiving 100, the chain
   * ended on 460 — it lost 40 for a shortfall of 20. The `transfer_out` leg
   * takes the whole load off the sender's shelf at send time, so a later
   * `waste` leg for the missing part removes it a second time.
   *
   * The physical truth these tests pin: the sender's shelf loses exactly what
   * left it, the receiver's gains exactly what arrived, and the chain is down
   * by the shortfall — once.
   */
  const legsFor = (sentQuantity: number, receivedQuantity: number) => [
    ...buildSendMovements({
      fromOutletId: 'o-north',
      lines: [receipt({ sentQuantity, receivedQuantity })],
    }),
    ...buildReceiveMovements({
      fromOutletId: 'o-north',
      toOutletId: 'o-south',
      lines: [receipt({ sentQuantity, receivedQuantity })],
    }),
  ]

  const netAt = (legs: ReturnType<typeof legsFor>, outletId: string | null) =>
    legs.filter((leg) => leg.outletId === outletId).reduce((sum, leg) => sum + leg.quantityDelta, 0)

  const chainNet = (legs: ReturnType<typeof legsFor>) =>
    legs.reduce((sum, leg) => sum + leg.quantityDelta, 0)

  it('moves no stock at all when the whole load arrives', () => {
    expect(chainNet(legsFor(10, 10))).toBe(0)
  })

  it('costs the chain the shortfall exactly once', () => {
    // 10 left North and 8 arrived. Two units are gone — not four.
    expect(chainNet(legsFor(10, 8))).toBe(-2)
  })

  it('takes off the sending branch exactly what left it', () => {
    // The whole load left North's shelf. What happened to it afterwards is not
    // North's shelf's problem a second time.
    expect(netAt(legsFor(10, 8), 'o-north')).toBe(-10)
  })

  it('puts on the receiving branch exactly what arrived', () => {
    expect(netAt(legsFor(10, 8), 'o-south')).toBe(8)
  })

  it('still books the loss as waste against the sender', () => {
    // The conservation fix must not cost us the shrinkage record — this leg is
    // what a variance report reads, and where the investigation starts.
    const waste = legsFor(10, 8).filter((leg) => leg.reason === 'waste')

    expect(waste).toEqual([
      expect.objectContaining({ outletId: 'o-north', quantityDelta: -2 }),
    ])
  })

  it('costs the chain the whole load when nothing arrives', () => {
    // A van that never turned up: the chain is down 10, and North's shelf --
    // which the send already emptied -- is not charged twice for it.
    const legs = legsFor(10, 0)

    expect(chainNet(legs)).toBe(-10)
    expect(netAt(legs, 'o-north')).toBe(-10)
    expect(netAt(legs, 'o-south')).toBe(0)
  })
})

describe('who may act on a transfer', () => {
  it('lets a store-wide account send from any branch', () => {
    expect(canSendTransfer(ALL, 'o-north')).toBe(true)
    expect(canSendTransfer(ALL, null)).toBe(true)
  })

  it('lets a branch send only its own stock', () => {
    // Sending writes a deduction against the source shelf. A manager who could
    // name someone else's branch could empty it.
    expect(canSendTransfer(AT_NORTH, 'o-north')).toBe(true)
    expect(canSendTransfer(AT_NORTH, 'o-south')).toBe(false)
  })

  it('does not let a branch send the unbranched store pool', () => {
    // Pool stock is the store's, not any one shop's — the same rule the RLS
    // predicate already applies to reads.
    expect(canSendTransfer(AT_NORTH, null)).toBe(false)
  })

  it('lets only the destination count a delivery in', () => {
    // Receiving credits a shelf. The sender declaring their own delivery
    // received is what makes a shortfall unfindable.
    expect(canReceiveTransfer(AT_SOUTH, 'o-south')).toBe(true)
    expect(canReceiveTransfer(AT_NORTH, 'o-south')).toBe(false)
    expect(canReceiveTransfer(ALL, 'o-south')).toBe(true)
  })
})

describe('resolveReceiptLines', () => {
  const sent: readonly TransferLineReceipt[] = [
    { inventoryItemId: 'item-flour', sentQuantity: 10, receivedQuantity: 0, unitCost: 25 },
    { inventoryItemId: 'item-sugar', sentQuantity: 4, receivedQuantity: 0, unitCost: 60 },
  ]

  it('pairs each sent line with what was counted', () => {
    const lines = resolveReceiptLines(sent, { 'item-flour': 8, 'item-sugar': 4 })

    expect(lines).toEqual([
      expect.objectContaining({ inventoryItemId: 'item-flour', sentQuantity: 10, receivedQuantity: 8 }),
      expect.objectContaining({ inventoryItemId: 'item-sugar', sentQuantity: 4, receivedQuantity: 4 }),
    ])
  })

  it('keeps the source unit cost rather than taking one from the payload', () => {
    const lines = resolveReceiptLines(sent, { 'item-flour': 8, 'item-sugar': 4 })

    expect(lines[0].unitCost).toBe(25)
  })

  it('refuses a line nobody counted', () => {
    // Assuming an uncounted line arrived intact is the whole failure mode the
    // receive step exists to prevent.
    expect(() => resolveReceiptLines(sent, { 'item-flour': 8 })).toThrow(/counted/i)
  })

  it('refuses a count for something that was never on the transfer', () => {
    expect(() =>
      resolveReceiptLines(sent, { 'item-flour': 8, 'item-sugar': 4, 'item-salt': 1 }),
    ).toThrow(/not on this transfer/i)
  })

  it('refuses a count that is not a finite number', () => {
    expect(() =>
      resolveReceiptLines(sent, { 'item-flour': Number.NaN, 'item-sugar': 4 }),
    ).toThrow(/number/i)
  })
})
