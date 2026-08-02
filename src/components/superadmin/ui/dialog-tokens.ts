/**
 * Shared class strings for the superadmin's plain dialogs.
 *
 * The two collections dialogs — record a payment, edit allowances — are the
 * same form twice over, and they were already drifting: one shipped a hint line
 * the other did not. Keeping the surface in one place means a change to the
 * dark palette lands on both, which is the failure that put light-on-light
 * fields in front of the owner in the first place.
 */

/** The field caption above an input. */
export const DIALOG_LABEL = 'text-white/60'

/** Text, number, and select inputs. */
export const DIALOG_FIELD =
  'mt-1 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none'

/** The confirming action. Inverted, matching the primitives' active control. */
export const DIALOG_PRIMARY_BUTTON =
  'rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50'

/** The way out. Quiet enough that it never competes with the primary. */
export const DIALOG_CANCEL_BUTTON =
  'rounded-lg px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50'

/** A caveat the owner should read but not be alarmed by. */
export const DIALOG_HINT = 'mt-3 text-xs text-white/45'
