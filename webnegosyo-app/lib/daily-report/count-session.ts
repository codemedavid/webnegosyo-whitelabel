/**
 * A stock count as one act, rather than as scattered `stocktake` movements.
 *
 * The ledger already records every count. What it cannot record is where a
 * count STOPPED, and that omission is expensive in one specific way: on the
 * daily report, an ingredient nobody looked at and an ingredient that
 * reconciled perfectly produce the identical row — zero discrepancy, no
 * shrinkage, nothing to answer for. A count abandoned at the fourth shelf
 * therefore reads as a spotless store.
 *
 * A session fixes that by naming the denominator. `expectedItemCount` is a
 * SNAPSHOT taken when the count opened, not a live count of the shelf, because
 * a live denominator rewrites history: an ingredient added next month would
 * quietly demote last month's finished count to a partial one.
 *
 * These are pure judgements over a session's facts. Persistence lives in the
 * service; the rules live here so both surfaces reach the same verdict.
 */

/**
 * `open` — running; nothing is missing yet.
 * `complete` — closed, and every ingredient in scope was reached.
 * `partial` — closed early. Some shelves were never looked at.
 * `abandoned` — closed with nothing counted at all.
 */
export type CountSessionState = 'open' | 'complete' | 'partial' | 'abandoned'

export interface CountSessionInput {
  /** How many ingredients were in scope when the count opened. */
  expectedItemCount: number
  /** Every ingredient counted in this session, duplicates allowed. */
  countedItemIds: readonly string[]
  /** When the merchant declared the count over, or `null` while it runs. */
  closedAt: string | null
}

export interface CountSessionProgress {
  state: CountSessionState
  /** Distinct ingredients reached. A recount of one sack is still one sack. */
  countedCount: number
  expectedCount: number
  /** `null` when there was no scope to measure against — never a hopeful 100. */
  coveragePercent: number | null
  /**
   * Whether an ingredient's LACK of a discrepancy is evidence of anything.
   * True only after a complete count; otherwise silence means nobody looked.
   */
  isShelfAccountedFor: boolean
}

/** Rounded DOWN, so an unfinished count can never present itself as finished. */
function coverageOf(counted: number, expected: number): number | null {
  if (!Number.isFinite(expected) || expected <= 0) return null
  return Math.min(100, Math.floor((counted / expected) * 100))
}

function stateOf(
  counted: number,
  expected: number,
  isClosed: boolean,
): CountSessionState {
  if (!isClosed) return 'open'
  if (counted <= 0) return 'abandoned'
  // `>=`, not `===`: an ingredient added while the merchant was counting is
  // genuinely countable and genuinely outside the snapshot, so a thorough count
  // can legitimately exceed its own denominator.
  if (expected > 0 && counted >= expected) return 'complete'
  return 'partial'
}

export function judgeCountSession({
  expectedItemCount,
  countedItemIds,
  closedAt,
}: CountSessionInput): CountSessionProgress {
  const countedCount = new Set(countedItemIds).size
  // A corrupt snapshot costs the merchant their coverage figure, not their
  // stock report: this is a read-only surface over data written elsewhere.
  const expectedCount =
    Number.isFinite(expectedItemCount) && expectedItemCount > 0 ? expectedItemCount : 0

  const state = stateOf(countedCount, expectedCount, closedAt !== null)

  return {
    state,
    countedCount,
    expectedCount,
    coveragePercent: coverageOf(countedCount, expectedCount),
    isShelfAccountedFor: state === 'complete',
  }
}

/**
 * One sentence for the report's caveat list, or `null` when the count needs no
 * explaining. A caveat that shows up on a good day is noise, and noise is how
 * the caveats that matter stop being read.
 */
export function describeCountSession(progress: CountSessionProgress): string | null {
  switch (progress.state) {
    case 'complete':
      return null
    case 'open':
      return 'A stock count is still in progress, so these figures may change.'
    case 'abandoned':
      return 'A stock count was started and nothing was counted, so no shrinkage figure here is confirmed.'
    case 'partial':
      // Ingredients, not percent: "10%" names nothing the merchant can go and
      // look at, while "4 of 40" names the aisle they stopped at.
      return `The stock count reached ${progress.countedCount} of ${progress.expectedCount} ingredients — the rest were not counted, so their figures are unconfirmed.`
  }
}
