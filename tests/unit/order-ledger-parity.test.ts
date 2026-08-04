/**
 * Whether a placed order's settlement ledger can be trusted right now.
 *
 * Two failures look identical to a screen holding an error, and they mean
 * opposite things:
 *
 *   - The deployment has no ledger function at all. It cannot record a payment
 *     either, so nothing was ever settled through it: the ledger is EMPTY and
 *     the bill on screen is the whole truth about what is owed.
 *   - The ledger exists but the read failed. The order may already be paid, so
 *     the bill on screen is a guess.
 *
 * Reading the first as the second already cost this product once: it "stopped
 * merchants editing orders on every store still running a bundle older than the
 * ledger — most of them" (`webnegosyo-app/lib/order-ledger.ts`).
 *
 * Reading the SECOND as the FIRST is the more expensive direction, and it is
 * the one the web is about to expose. An unreadable ledger rendered as an empty
 * one shows a fully-paid order as owing its whole total — and a merchant
 * collects money the customer has already handed over.
 *
 * The markers are Convex's own wording, produced by the deployment rather than
 * by any client, so the web can match on exactly the same strings. What differs
 * is the INPUT: the register reads `error?: string | null` out of
 * `useSafeQuery`, while the web's Convex client throws `Error` objects. The web
 * copy therefore accepts `unknown` and normalizes — strictly wider than the
 * app's, and the parity block below pins that the shared substrate still agrees.
 */
import { describe, it, expect } from '@jest/globals'
import {
  resolveLedgerState as resolveOnWeb,
  isLedgerSafeToEdit as safeOnWeb,
} from '@/lib/order-ledger'
import {
  resolveLedgerState as resolveOnApp,
  isLedgerSafeToEdit as safeOnApp,
} from '../../webnegosyo-app/lib/order-ledger'

/**
 * Real Convex wordings. `Could not find public function` is the one that means
 * "this deployment predates the ledger"; everything else is a genuine failure.
 */
const MISSING_FN = 'Could not find public function for "orders:getOrderPayments"'
const ARG_VALIDATION = 'ArgumentValidationError: Object contains extra field'
const NOT_IN_VALIDATOR = "Value does not match validator. Path: .outletId is not in the validator"
const NETWORK = 'Failed to fetch'
const SERVER = 'Server Error: uncaught exception'

// ---- The judgement itself --------------------------------------------------

describe('classifying a settlement-ledger read', () => {
  it('treats a clean read as available', () => {
    expect(resolveOnWeb(null)).toBe('available')
    expect(resolveOnWeb(undefined)).toBe('available')
  })

  /**
   * A deployment with no ledger function cannot have recorded a payment on it,
   * so an empty ledger is the truth rather than a gap.
   */
  it('treats a missing ledger function as an absent ledger, not a broken one', () => {
    expect(resolveOnWeb(MISSING_FN)).toBe('absent')
  })

  /**
   * The expensive direction. A read that merely failed must never be mistaken
   * for "nothing was ever paid".
   */
  it('treats a failed read as unavailable', () => {
    expect(resolveOnWeb(NETWORK)).toBe('unavailable')
    expect(resolveOnWeb(SERVER)).toBe('unavailable')
  })

  /**
   * A stale deployment that HAS the ledger but rejects an argument is still a
   * failed read of a ledger that exists. Only a missing function proves
   * emptiness.
   */
  it('does not treat an argument rejection as an absent ledger', () => {
    expect(resolveOnWeb(ARG_VALIDATION)).toBe('unavailable')
    expect(resolveOnWeb(NOT_IN_VALIDATOR)).toBe('unavailable')
  })
})

// ---- The web's wider input -------------------------------------------------

describe('the web accepts what its Convex client actually throws', () => {
  it('reads an Error the same way it reads the message inside it', () => {
    expect(resolveOnWeb(new Error(MISSING_FN))).toBe('absent')
    expect(resolveOnWeb(new Error(NETWORK))).toBe('unavailable')
  })

  it('treats an empty error message as no error', () => {
    expect(resolveOnWeb('')).toBe('available')
    expect(resolveOnWeb(new Error(''))).toBe('available')
  })

  /**
   * An error of a shape nobody anticipated is still an error. Defaulting to
   * `absent` here would render an unreadable ledger as unpaid.
   */
  it('treats an unrecognisable error as unavailable, never as absent', () => {
    expect(resolveOnWeb({ code: 500 })).toBe('unavailable')
    expect(resolveOnWeb(['boom'])).toBe('unavailable')
    expect(resolveOnWeb(42)).toBe('unavailable')
  })
})

// ---- What each state permits ----------------------------------------------

describe('what may be done against a ledger in each state', () => {
  it('allows a bill to be changed against a loaded ledger', () => {
    expect(safeOnWeb('available')).toBe(true)
  })

  /**
   * `absent` passes: re-pricing against an empty ledger is exactly what the
   * register did before the ledger existed.
   */
  it('allows a bill to be changed against an absent ledger', () => {
    expect(safeOnWeb('absent')).toBe(true)
  })

  it('blocks a bill from being changed when the ledger could not be read', () => {
    expect(safeOnWeb('unavailable')).toBe(false)
  })
})

// ---- Parity with the register ---------------------------------------------

const MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ['a missing ledger function', MISSING_FN],
  ['an argument validation error', ARG_VALIDATION],
  ['an unknown validator field', NOT_IN_VALIDATOR],
  ['a network failure', NETWORK],
  ['a server exception', SERVER],
  ['an empty message', ''],
  ['an unrelated message', 'something else went wrong'],
]

describe('ledger-state parity — web vs merchant app', () => {
  it.each(MESSAGES)('agrees how to classify %s', (_label, message) => {
    expect(resolveOnWeb(message)).toEqual(resolveOnApp(message))
  })

  it.each(MESSAGES)('agrees what %s permits', (_label, message) => {
    expect(safeOnWeb(resolveOnWeb(message))).toEqual(safeOnApp(resolveOnApp(message)))
  })

  it('agrees that no error means available', () => {
    expect(resolveOnWeb(null)).toEqual(resolveOnApp(null))
  })
})
