/**
 * How much a placed order's settlement ledger can be trusted right now.
 *
 * Two failures look identical to a screen holding an error, and they mean
 * opposite things:
 *
 *   - The deployment has no ledger function at all. It cannot record a payment
 *     either, so nothing was ever settled through it: the ledger is EMPTY, and
 *     the bill on screen is the whole truth about what is owed.
 *   - The ledger exists but the read failed. The order may already be paid, so
 *     the bill on screen is a guess.
 *
 * Reading the first as the second already cost this product once: it stopped
 * merchants editing orders on every store still running a bundle older than the
 * ledger — most of them.
 *
 * Reading the SECOND as the FIRST is the more expensive direction, and it is the
 * one the web is about to expose. An unreadable ledger rendered as an empty one
 * shows a fully-paid order as owing its whole total, and a merchant collects
 * money the customer has already handed over. Everything unrecognised therefore
 * falls to `unavailable`; only the one marker that PROVES emptiness returns
 * `absent`.
 *
 * PORT of `webnegosyo-app/lib/order-ledger.ts`, pinned by
 * `tests/unit/order-ledger-parity.test.ts`.
 *
 * The marker is Convex's own wording, produced by the deployment rather than by
 * any client, so it matches identically on both sides. What differs is the
 * INPUT: the register reads `error?: string | null` out of `useSafeQuery`, while
 * the web's Convex client throws `Error` objects. This copy accepts `unknown`
 * and normalizes, which is strictly wider than the app's and cannot classify a
 * shared message differently.
 *
 * Deliberately NOT a port of `stale-backend.ts`. That module answers "was this
 * WRITE rejected, and what do I tell the cashier?" — advice copy the web has no
 * caller for. This one answers "may I trust this READ?", which is the only half
 * the web needs.
 */

/** Convex's wording when the function itself is absent from the bundle. */
const MISSING_FN_MARKER = 'Could not find public function'

export type LedgerState =
  /** Loaded. The payments in hand are all of them. */
  | 'available'
  /** This backend has no ledger, so no payment can have been recorded on it. */
  | 'absent'
  /** The ledger exists but could not be read. What is owed is unknown. */
  | 'unavailable'

/**
 * The message inside whatever the Convex client threw.
 *
 * Returns null for "no error at all", which includes an error carrying an empty
 * message: there is nothing there to classify, and inventing `unavailable` from
 * it would hide a perfectly good ledger behind a warning.
 */
function messageOf(error: unknown): string | null {
  if (error == null) return null
  if (typeof error === 'string') return error === '' ? null : error
  if (error instanceof Error) return error.message === '' ? null : error.message
  // Some other shape entirely. It is still an error, and it is not the one
  // marker that proves emptiness — so it must read as unavailable, never absent.
  return 'unrecognised ledger error'
}

/** True when the failure is specifically a function missing from the bundle. */
export function isMissingFunctionError(message: string): boolean {
  return message.includes(MISSING_FN_MARKER)
}

/** Classify a settlement-ledger query error. No error means it loaded. */
export function resolveLedgerState(error?: unknown): LedgerState {
  const message = messageOf(error)
  if (message === null) return 'available'
  return isMissingFunctionError(message) ? 'absent' : 'unavailable'
}

/**
 * May a bill be changed against a ledger in this state?
 *
 * `absent` passes: changing a bill re-prices it, and re-pricing against an empty
 * ledger is exactly what the register did before the ledger existed. Only
 * `unavailable` blocks, where the order may already be settled and the change
 * would re-charge a customer who has paid.
 */
export function isLedgerSafeToEdit(state: LedgerState): boolean {
  return state !== 'unavailable'
}
