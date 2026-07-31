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

import type { BranchScope } from '@/lib/outlets/branch-scope'

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
 * May this account send stock out of `fromOutletId`?
 *
 * Sending writes a deduction against the source shelf, so a branch may send
 * only its own stock — a manager who could name another branch could empty it.
 *
 * A branch may not send the unbranched pool. Pool stock belongs to the store
 * rather than to any one shop, which is exactly what `app_user_may_reach_branch`
 * already says about reading it, and letting a manager drain it into their own
 * branch would be the same claim made with a form.
 */
export function canSendTransfer(scope: BranchScope, fromOutletId: string | null): boolean {
  if (scope.kind === 'all') return true
  return fromOutletId !== null && fromOutletId === scope.outletId
}

/**
 * May this account count a delivery in at `toOutletId`?
 *
 * Only the destination, or a store-wide account. The receive step exists so
 * that somebody at the other end counts what physically arrived; a sender who
 * could declare their own delivery received would make every shortfall
 * unfindable, which is the one thing this whole document is for.
 */
export function canReceiveTransfer(scope: BranchScope, toOutletId: string | null): boolean {
  if (scope.kind === 'all') return true
  return toOutletId !== null && toOutletId === scope.outletId
}

/**
 * The transfer's lines paired with what the destination actually counted.
 *
 * Every line must be counted. Defaulting an uncounted line to the amount sent
 * would quietly assume the load was intact, which is precisely the assumption
 * the receive step exists to stop being made; and defaulting it to zero would
 * accuse the sender of losing stock nobody looked for.
 *
 * The unit cost comes off the stored line, never the payload — the price was
 * fixed when the stock left, and a receiving screen that could restate it could
 * revalue the chain's stock.
 */
export function resolveReceiptLines(
  lines: readonly TransferLineReceipt[],
  counts: Readonly<Record<string, number>>,
): TransferLineReceipt[] {
  const known = new Set(lines.map((line) => line.inventoryItemId))
  for (const itemId of Object.keys(counts)) {
    if (!known.has(itemId)) {
      throw new Error('A counted ingredient is not on this transfer')
    }
  }

  return lines.map((line) => {
    const counted = counts[line.inventoryItemId]
    if (counted === undefined) {
      throw new Error('Every ingredient on the transfer has to be counted')
    }
    if (typeof counted !== 'number' || !Number.isFinite(counted)) {
      throw new Error('A counted quantity must be a number')
    }

    return { ...line, receivedQuantity: counted }
  })
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
 * A shortfall posts as `waste` against the **sending** branch: the missing
 * stock is not the receiver's loss, since it never reached their shelf, and the
 * loss belongs where the investigation has to start — with whoever loaded the
 * van.
 *
 * Writing that waste leg alone would charge the sender twice. The `transfer_out`
 * at send already took the *whole* load off their shelf, so the shortfall is
 * returned to them first and then written off, and the two legs together leave
 * the branch down by exactly what left it. Without the return leg a chain that
 * lost 20 of a 120-unit load ends up 40 short — the defect a probe against real
 * branch rows exposed, after every leg had been checked in isolation and none
 * of them added together.
 *
 * The return leg is a `transfer_in` rather than a `void`: reports bucket
 * transfers signed, so it nets against the `transfer_out` and reads as "sent
 * 8 net, wasted 2". A `void` would land in sales and claim a sale that never
 * happened.
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
      // Back onto the sender's book before it is written off, because the send
      // leg already removed it. Charging the waste against a shelf that no
      // longer holds the stock is how a 20-unit shortfall costs a chain 40.
      movements.push({
        inventoryItemId: line.inventoryItemId,
        outletId: input.fromOutletId,
        reason: 'transfer_in',
        quantityDelta: shortfall,
        unitCost: line.unitCost,
        note: 'Undelivered on branch transfer',
      })
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
