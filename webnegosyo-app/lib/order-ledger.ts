/**
 * How much an order's settlement ledger can be trusted right now.
 *
 * Two failures look identical to a screen holding a query error string, and
 * they mean opposite things:
 *
 *   - The deployment has no ledger function at all. It cannot record a payment
 *     either, so nothing was ever settled through it: the ledger is EMPTY, and
 *     the bill on screen is the whole truth about what is owed.
 *   - The ledger exists but the read failed. The order may already be paid, so
 *     the bill on screen is a guess.
 *
 * Reading the first as the second is what stopped merchants editing orders on
 * every store still running a bundle older than the ledger — most of them.
 *
 * Pure, and separate from `stale-backend` because that module answers "was this
 * WRITE rejected?"; this one answers "may I trust this READ?".
 */

import { isMissingFunctionError } from "./stale-backend";

export type LedgerState =
  /** Loaded. The payments in hand are all of them. */
  | "available"
  /** This backend has no ledger, so no payment can have been recorded on it. */
  | "absent"
  /** The ledger exists but could not be read. What is owed is unknown. */
  | "unavailable";

/** Classify a settlement-ledger query error. No error means it loaded. */
export function resolveLedgerState(error?: string | null): LedgerState {
  if (!error) return "available";
  return isMissingFunctionError(error) ? "absent" : "unavailable";
}

/**
 * May a bill be edited against a ledger in this state?
 *
 * `absent` passes: an edit re-prices a bill, and re-pricing against an empty
 * ledger is exactly what the register did before the ledger existed. Only
 * `unavailable` blocks, where the order may already be settled and the edit
 * would re-charge a customer who has paid.
 */
export function isLedgerSafeToEdit(state: LedgerState): boolean {
  return state !== "unavailable";
}
