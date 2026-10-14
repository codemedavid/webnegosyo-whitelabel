/**
 * Quiet hours in Manila wall time (UTC+8, no DST). A text due inside the
 * window is HELD until it ends — never dropped — so `not_before` on the
 * outbox row carries the answer and the phone simply waits.
 */

const MANILA_OFFSET_MINUTES = 8 * 60
const MINUTES_PER_DAY = 24 * 60

function toMinutes(hhmm: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function manilaMinuteOfDay(instant: Date): number {
  const total = Math.floor(instant.getTime() / 60_000) + MANILA_OFFSET_MINUTES
  return ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

export function isQuietAt(instant: Date, start: string, end: string): boolean {
  const from = toMinutes(start)
  const to = toMinutes(end)
  if (from === null || to === null || from === to) return false
  const minute = manilaMinuteOfDay(instant)
  return from < to ? minute >= from && minute < to : minute >= from || minute < to
}

/** `instant` itself, or the end of the quiet window it falls in. */
export function nextSendableAt(instant: Date, start: string, end: string): Date {
  if (!isQuietAt(instant, start, end)) return instant
  const to = toMinutes(end) as number
  const minute = manilaMinuteOfDay(instant)
  const wait = ((to - minute) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const startOfMinute = Math.floor(instant.getTime() / 60_000) * 60_000
  return new Date(startOfMinute + wait * 60_000)
}
