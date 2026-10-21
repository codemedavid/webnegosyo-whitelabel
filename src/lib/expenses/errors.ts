/**
 * Expenses — Postgres refusals as sentences a store owner can act on.
 *
 * The raw error is logged (code + message, never the input) and replaced with
 * one of these messages, so an action can show `error.message` as it is and a
 * constraint name or a policy name never reaches the screen.
 */

export const EXPENSE_MESSAGES = {
  noAccess: "You don't have access to expenses.",
  noteRequired: 'Add a note for this category.',
  drawerLocked: 'A drawer expense keeps its amount and date. Record a pay in on the drawer to correct the cash.',
  goneOrVoided: "That expense was already voided or doesn't exist.",
  notFound: "That expense isn't available.",
  invalid: "Some details don't add up. Check the amounts and try again.",
  missingReference: 'That category, supplier or branch is no longer available. Pick another and try again.',
  shiftClosed: 'This drawer is already closed. Open a drawer first.',
  duplicate: 'That is already saved.',
  categoryNameTaken: 'There is already a category with that name.',
  supplierNameTaken: 'There is already someone with that name under Paid to.',
  categoryGone: 'That category is no longer available.',
  supplierGone: 'That supplier is no longer available.',
  payoutGone: 'That pay-out could not be found.',
  payoutAlreadySorted: 'That pay-out is already filed as an expense.',
  drawerGone: 'That drawer could not be found. Open a drawer first.',
  spentOnFuture: "An expense can't be dated in the future.",
  spentOnTooOld: "An expense can't be dated more than 400 days back.",
  reasonRequired: 'Say why.',
  drawerShiftClosed: "This shift is closed, so the cash can't go back into the drawer. Use Fix to change the category instead.",
  unknown: "We couldn't save that. Please try again.",
  readFailed: "We couldn't load your expenses. Please try again.",
} as const

export interface PostgresErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function mentions(error: PostgresErrorLike, word: string): boolean {
  return [error.message, error.details, error.hint].some((text) => typeof text === 'string' && text.includes(word))
}

/** Refusals the expense SQL raises by name (migrations 20261022120000/120100). */
const KNOWN_REFUSALS: ReadonlyArray<readonly [string, string]> = [
  ['movement_not_found', EXPENSE_MESSAGES.payoutGone],
  ['expenses_movement_recorded_uq', EXPENSE_MESSAGES.payoutAlreadySorted],
  ['drawer_payout_already_sorted', EXPENSE_MESSAGES.payoutAlreadySorted],
  ['drawer_shift_closed', EXPENSE_MESSAGES.drawerShiftClosed],
  ['shift_not_found', EXPENSE_MESSAGES.drawerGone],
  ['spent_on_in_future', EXPENSE_MESSAGES.spentOnFuture],
  ['spent_on_too_old', EXPENSE_MESSAGES.spentOnTooOld],
  ['reason_required', EXPENSE_MESSAGES.reasonRequired],
]

/** The sentence for a database refusal; `unknown` when it is not one we expect. */
export function expenseErrorMessage(error: PostgresErrorLike): string {
  if (mentions(error, 'note_required')) return EXPENSE_MESSAGES.noteRequired
  if (mentions(error, 'drawer_locked')) return EXPENSE_MESSAGES.drawerLocked
  if (mentions(error, 'This shift is already closed')) return EXPENSE_MESSAGES.shiftClosed
  const known = KNOWN_REFUSALS.find(([word]) => mentions(error, word))
  if (known) return known[1]
  switch (error.code) {
    case '42501':
      return EXPENSE_MESSAGES.noAccess
    case 'P0002':
      return EXPENSE_MESSAGES.goneOrVoided
    case '22023':
    case '23514':
    case '22P02':
      return EXPENSE_MESSAGES.invalid
    case '23503':
      return EXPENSE_MESSAGES.missingReference
    case '23505':
      return EXPENSE_MESSAGES.duplicate
    default:
      return EXPENSE_MESSAGES.unknown
  }
}

/** Logs the raw refusal and returns an Error carrying only the sentence. */
export function toExpenseError(context: string, error: PostgresErrorLike, override?: string): Error {
  console.error(`[expenses] ${context} failed`, { code: error.code ?? null, message: error.message ?? null })
  return new Error(override ?? expenseErrorMessage(error))
}

/** A unique violation on the request id: the same tap arrived twice. */
export function isClientRequestConflict(error: PostgresErrorLike): boolean {
  return error.code === '23505' && mentions(error, 'client_request')
}

/** A unique violation (name taken, double link …). */
export function isUniqueViolation(error: PostgresErrorLike): boolean {
  return error.code === '23505'
}
