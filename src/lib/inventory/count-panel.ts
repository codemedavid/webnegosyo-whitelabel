/**
 * What the stock-count panel says.
 *
 * Pure and separate from the component, like `stock-alerts-view.ts` and
 * `daily-report-view.ts`. The merchant app will grow the same panel, and two
 * surfaces describing one count differently is worse than either being plain.
 *
 * The panel's job beyond its two buttons is to say how much of the shelf is
 * still unlooked-at, in a unit the merchant can act on. "38%" names nothing
 * they can walk to; "12 of 40 ingredients" names the aisle they are standing
 * in, and "28 still to count" names the pile.
 *
 * NOTHING HERE MAY USE `toLocaleString` — see the note atop `daily-report-view`.
 */

import type { CountSessionProgress } from '@/lib/inventory/count-session'

export interface CountPanelCopy {
  /** Whether a count is running right now. Drives which button is offered. */
  isCounting: boolean
  /** `null` when there is no count, or no scope to measure one against. */
  progressLabel: string | null
  /** Ingredients still untouched. Never negative — see `remainingOf`. */
  remainingCount: number
  detail: string
  actionLabel: string
  /**
   * Said at the moment the merchant can still change the outcome. `null` once
   * every ingredient has been reached: a warning that shows up on a finished
   * count is noise, and noise is how the warnings that matter stop being read.
   */
  closingWarning: string | null
}

/** Plural-aware, because "1 ingredients" reads as a bug in the report itself. */
function ingredients(count: number): string {
  return count === 1 ? '1 ingredient' : `${count} ingredients`
}

/**
 * Clamped at zero. An ingredient added mid-count is genuinely countable and
 * genuinely outside the snapshot, so a thorough count can exceed its own
 * denominator — and "-3 left" reads as a bug that discredits the figure beside
 * it.
 */
function remainingOf(progress: CountSessionProgress): number {
  return Math.max(0, progress.expectedCount - progress.countedCount)
}

const NO_COUNT_DETAIL =
  'Count what is physically on the shelf and this report will tell you what is missing,' +
  ' rather than assuming the ledger was right.'

export function describeCountPanel(progress: CountSessionProgress | null): CountPanelCopy {
  // `state === 'open'` rather than "a session exists": a closed count is
  // history, and offering to reopen it would move `closed_at`, which is the
  // evidence for when this shelf was last accounted for.
  const isCounting = progress?.state === 'open'

  if (!progress || !isCounting) {
    return {
      isCounting: false,
      progressLabel: null,
      remainingCount: 0,
      detail: NO_COUNT_DETAIL,
      actionLabel: 'Start stock count',
      closingWarning: null,
    }
  }

  const remaining = remainingOf(progress)

  return {
    isCounting: true,
    // Null when nothing was in scope: a store with no tracked ingredients has
    // not achieved a perfect count, it has nothing to count.
    progressLabel:
      progress.expectedCount > 0
        ? `${progress.countedCount} of ${progress.expectedCount} counted`
        : null,
    remainingCount: remaining,
    detail:
      remaining > 0
        ? `${ingredients(remaining)} still to count.`
        : 'Every ingredient has been counted.',
    actionLabel: 'Finish count',
    closingWarning:
      remaining > 0
        ? `${ingredients(remaining)} are still uncounted. Finishing now leaves their figures unconfirmed.`
        : null,
  }
}
