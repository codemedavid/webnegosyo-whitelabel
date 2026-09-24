/**
 * Delay before the next poll: the base interval while healthy, doubling per
 * consecutive failure up to a ceiling, with a little jitter once failing so
 * every open tab does not hammer a recovering backend in lockstep.
 *
 * The jitter comes from a caller-held seed, never a fresh `Math.random()`:
 * a delay that changes every time it is computed re-arms its own timer and
 * never fires (see memory: tanstack-poll-backoff-gotchas).
 */

export const MAX_POLL_BACKOFF_MS = 120_000

/** Up to +25% on a failing poll's delay. */
const JITTER_FRACTION = 0.25

export interface PollDelayInput {
  baseMs: number
  consecutiveFailures: number
  /** A stable value in [0, 1) held for the lifetime of one poller. */
  jitterSeed: number
}

export function computePollDelayMs({ baseMs, consecutiveFailures, jitterSeed }: PollDelayInput): number {
  if (consecutiveFailures <= 0) return baseMs
  const backoff = baseMs * 2 ** Math.min(consecutiveFailures, 16)
  const jittered = backoff * (1 + JITTER_FRACTION * jitterSeed)
  return Math.min(Math.round(jittered), MAX_POLL_BACKOFF_MS)
}
