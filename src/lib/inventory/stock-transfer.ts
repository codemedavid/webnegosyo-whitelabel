/**
 * Moving stock from one branch to another.
 *
 * The cross-branch panel names a direction — North → South. This is the
 * arithmetic that performs it, and it is the only operation in the system that
 * touches two shelves at once, so it is the only place stock can be created or
 * destroyed by an off-by-one.
 *
 * **Every leg is a real ledger movement.** Nothing here swaps quantities
 * between `inventory_stock` rows. A swap would move the number without leaving
 * a row saying who moved it, when, and how much — and the ledger is the entire
 * reason "why is this figure wrong?" can be answered at all. It also means the
 * roll-up invariant holds for free: `transfer_out` and `transfer_in` net to
 * zero across the chain, so `inventory_items.current_qty` never moves on a
 * transfer, which is correct — the store still owns the same flour.
 *
 * Pure: nothing here queries or writes. The service composes these rows and
 * hands them to the same ledger insert every other movement goes through, so
 * the trigger keeps maintaining the per-branch totals.
 */

/**
 * Where a transfer is in its life.
 *
 * `sent` is the state that matters: the stock has left the source shelf and
 * has not reached the destination, so it is on neither. That is a real physical
 * state — a van — and pretending it does not exist is what lets two branches
 * both count the same sack.
 */
export type StockTransferStatus = 'draft' | 'sent' | 'received' | 'cancelled'

export const TRANSFER_STATUS_LABELS: Record<StockTransferStatus, string> = {
  draft: 'Draft',
  sent: 'In transit',
  received: 'Received',
  cancelled: 'Cancelled',
}

/**
 * The moves a transfer is allowed to make.
 *
 * `sent → cancelled` is deliberately absent. Once the stock is off the source
 * shelf, flipping a status does not put it back, and a cancel that silently
 * wrote reversing movements would be a second reversal path that has to agree
 * with the receiving one forever. A consignment that never turns up is closed
 * by receiving zero: the whole load posts as shrinkage against the sender,
 * which is both the honest accounting and the only path anyone has to maintain.
 */
const ALLOWED_TRANSITIONS: Record<StockTransferStatus, readonly StockTransferStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['received'],
  received: [],
  cancelled: [],
}

export function canTransitionTransfer(
  from: StockTransferStatus,
  to: StockTransferStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * The same question, for a caller that is about to write.
 *
 * Throws rather than returning false so a stale tab cannot send a transfer
 * twice: the second attempt reads `sent` and stops here, before any ledger row
 * is written.
 */
export function assertTransferTransition(
  from: StockTransferStatus,
  to: StockTransferStatus,
): void {
  if (!canTransitionTransfer(from, to)) {
    throw new Error(
      `A ${TRANSFER_STATUS_LABELS[from].toLowerCase()} transfer cannot be marked ${TRANSFER_STATUS_LABELS[to].toLowerCase()}`,
    )
  }
}

/** One ingredient on a transfer, as the sender writes it. Quantities are in stock units. */
export interface TransferLineDraft {
  inventoryItemId: string
  quantity: number
}

/** One ingredient on a transfer, as it is sent and then counted in. */
export interface TransferLineReceipt {
  inventoryItemId: string
  sentQuantity: number
  receivedQuantity: number
  /** The SOURCE branch's cost per stock unit — see `buildReceiveMovements`. */
  unitCost?: number
}

export interface TransferDraft {
  /** `null` is the unbranched store pool, which is where a single-shop tenant's stock sits. */
  fromOutletId: string | null
  toOutletId: string | null
  lines: readonly TransferLineDraft[]
}

/**
 * A ledger row a transfer wants written, before it becomes a database insert.
 *
 * Deliberately not the `stock_movements` row shape: this module has no business
 * knowing about tenant ids or column names, and keeping it at this width is
 * what lets the whole thing be tested without a database.
 */
export interface TransferMovement {
  inventoryItemId: string
  outletId: string | null
  reason: 'transfer_out' | 'transfer_in' | 'waste'
  /** Signed, in stock units. */
  quantityDelta: number
  unitCost?: number
  note?: string
}

/**
 * Whether this draft describes a move that can actually happen.
 *
 * Throws, like `resolveMovementBranch`, because every message here is meant for
 * the person filling the form in.
 */
export function validateTransferDraft(draft: TransferDraft): void {
  if (draft.fromOutletId === draft.toOutletId) {
    throw new Error('A transfer cannot be sent to the same branch it came from')
  }

  if (draft.lines.length === 0) {
    throw new Error('A transfer needs at least one ingredient')
  }

  const seen = new Set<string>()
  for (const line of draft.lines) {
    if (!(line.quantity > 0)) {
      throw new Error('Every line needs a quantity greater than zero')
    }
    // A duplicate line makes the receiving count ambiguous — the person
    // counting the delivery has two rows for one pile of flour.
    if (seen.has(line.inventoryItemId)) {
      throw new Error('Each ingredient can appear on a transfer only once')
    }
    seen.add(line.inventoryItemId)
  }
}

/**
 * The stock leaving the sending branch.
 *
 * One leg only. Nothing credits the destination here: stock in transit is on
 * neither shelf, and crediting on send would let the receiving branch sell
 * goods that are still on a van.
 */
export function buildSendMovements(input: {
  fromOutletId: string | null
  lines: readonly TransferLineReceipt[]
}): TransferMovement[] {
  return input.lines.map((line) => ({
    inventoryItemId: line.inventoryItemId,
    outletId: input.fromOutletId,
    reason: 'transfer_out' as const,
    quantityDelta: -line.sentQuantity,
    unitCost: line.unitCost,
  }))
}

/**
 * The stock arriving, and whatever failed to arrive with it.
 *
 * The receiving branch counts what is physically in front of them, which is the
 * whole point of a receive step — a transfer that is assumed to arrive intact
 * is just a swap with extra clicks.
 *
 * A shortfall posts as `waste` against the **sending** branch. The missing
 * stock is not the receiver's loss (it never reached their shelf) and it is not
 * still at the sender either (their `transfer_out` already took it off). This
 * leg is what makes the pair reconcile, and it puts the loss where the
 * investigation has to start: with whoever loaded the van.
 *
 * Arriving stock is valued at the **source** branch's cost. The receiver did
 * not buy it and has no price of its own to apply; using anything else would
 * change the chain's stock value on a movement that changed nothing but its
 * location.
 */
export function buildReceiveMovements(input: {
  fromOutletId: string | null
  toOutletId: string | null
  lines: readonly TransferLineReceipt[]
}): TransferMovement[] {
  const movements: TransferMovement[] = []

  for (const line of input.lines) {
    if (line.receivedQuantity < 0) {
      throw new Error('A received count cannot be negative')
    }
    if (line.receivedQuantity > line.sentQuantity) {
      // Honouring this would create stock out of nothing. It is a counting
      // error at one end or the other, and both ends need to look again.
      throw new Error('You cannot receive more than was sent')
    }

    if (line.receivedQuantity > 0) {
      movements.push({
        inventoryItemId: line.inventoryItemId,
        outletId: input.toOutletId,
        reason: 'transfer_in',
        quantityDelta: line.receivedQuantity,
        unitCost: line.unitCost,
      })
    }

    const shortfall = line.sentQuantity - line.receivedQuantity
    // Only when something is actually missing. A zero-quantity waste row would
    // accuse a branch of losing nothing on every clean transfer, forever, and
    // drown the real ones.
    if (shortfall > 0) {
      movements.push({
        inventoryItemId: line.inventoryItemId,
        outletId: input.fromOutletId,
        reason: 'waste',
        quantityDelta: -shortfall,
        unitCost: line.unitCost,
        note: 'Short on branch transfer',
      })
    }
  }

  return movements
}
