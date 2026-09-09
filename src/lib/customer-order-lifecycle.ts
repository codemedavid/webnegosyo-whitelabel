/**
 * What a lifecycle event should change on the customer ledger — pure, so the
 * rules can be reasoned about without a database.
 *
 * `upsertCustomerFromOrder` runs only when an order is CREATED. Nothing ever
 * recomputed on a status change, a cancellation or a refund, so a cancelled
 * order counted as a customer visit forever and no loyalty program could tell a
 * settled sale from an open ticket.
 *
 * These events arrive from three backends, over merchant handsets on flaky
 * connections, with retries. Three properties therefore have to hold:
 *
 *   - **Idempotent.** Replaying an event writes nothing.
 *   - **Monotonic in time.** An event older than what is recorded is dropped;
 *     without this a retried "preparing" can land after "delivered" and quietly
 *     un-count a real visit.
 *   - **Reversible.** Cancelling clears the completion stamp so the visit and
 *     any loyalty earned on it reverse; un-cancelling restores it. Orders do
 *     leave the cancelled state in this product, so `cancelled` is not terminal.
 *
 * Absent fields mean "unknown", never "cleared" — a POS event that does not
 * know the branch must not erase a branch the checkout recorded.
 */

export type OrderLifecycleSource = 'pos' | 'online'

export interface OrderLifecycleState {
  status: string
  paymentStatus: string | null
  source: OrderLifecycleSource
  outletId: string | null
  /** When the owning backend last changed this order. Orders the events. */
  updatedAt: string
  /** Stable first qualification time, independent of later order edits. */
  completedAt?: string | null
  /** Raw stored timestamp for compare-and-set, null on legacy records. */
  revision?: string | null
}

/** Ledger columns to write. Omitted keys are deliberately left untouched. */
export interface OrderLifecycleWrite {
  status?: string
  payment_status?: string | null
  source?: OrderLifecycleSource
  outlet_id?: string
  completed_at?: string | null
  updated_at?: string
}

/** Statuses meaning the order is finished and the visit really happened. */
const FULFILLED = new Set(['delivered', 'collected', 'completed', 'complete'])
/** Statuses meaning the order is undone; any visit or earning must reverse. */
const REVERSED = new Set(['cancelled', 'canceled', 'refunded', 'voided'])
/** Payment states meaning a POS sale was actually settled. */
const SETTLED = new Set(['paid', 'verified', 'settled'])

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function timeOf(iso: string): number {
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * When this order counts as a completed visit, or null while it does not.
 *
 * A POS sale completes at settlement — the counter hands the food over as it is
 * paid for, and there is no later delivery event to wait for. Everything else
 * completes only on confirmed fulfilment.
 */
function completionFor(state: OrderLifecycleState): string | null {
  if (REVERSED.has(normalize(state.status))) return null
  if (state.source === 'pos') {
    return SETTLED.has(normalize(state.paymentStatus)) ? state.completedAt ?? state.updatedAt : null
  }
  return FULFILLED.has(normalize(state.status)) ? state.completedAt ?? state.updatedAt : null
}

/**
 * The ledger columns an incoming event should write, or `null` when it should
 * write nothing at all (a replay, or an event the ledger has already moved past).
 */
export function decideLifecycleWrite(
  current: OrderLifecycleState | null,
  incoming: OrderLifecycleState,
): OrderLifecycleWrite | null {
  const completedAt = completionFor(incoming)

  if (!current) {
    return {
      status: incoming.status,
      payment_status: incoming.paymentStatus,
      source: incoming.source,
      ...(incoming.outletId ? { outlet_id: incoming.outletId } : {}),
      completed_at: completedAt,
      updated_at: incoming.updatedAt,
    }
  }

  // A late-arriving retry must never overwrite newer state.
  if (timeOf(incoming.updatedAt) < timeOf(current.updatedAt)) return null

  const write: OrderLifecycleWrite = {}

  if (normalize(incoming.status) !== normalize(current.status)) write.status = incoming.status
  if (normalize(incoming.paymentStatus) !== normalize(current.paymentStatus)) {
    write.payment_status = incoming.paymentStatus
  }
  if (incoming.source !== current.source) write.source = incoming.source
  // Only ever fill a branch in; an event that does not know it must not clear it.
  if (incoming.outletId && incoming.outletId !== current.outletId) write.outlet_id = incoming.outletId

  const currentCompletion = completionFor(current)
  // Remaining qualified is not a second visit. Keep its original timestamp.
  if ((completedAt === null) !== (currentCompletion === null)) write.completed_at = completedAt

  if (Object.keys(write).length === 0 && timeOf(incoming.updatedAt) === timeOf(current.updatedAt)) return null

  write.updated_at = incoming.updatedAt
  return write
}
