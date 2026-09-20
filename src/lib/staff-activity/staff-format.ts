/**
 * How staff facts are written on screen.
 *
 * Shared by the directory, the profile header, the shift table and the day
 * history so "last active" never reads `5h ago` on one card and
 * `Sep 19, 3:00 PM` on the next. Pure string work, no I/O, `now` always
 * passed in — a formatter that reads the clock cannot be tested.
 *
 * Dates are rendered from a Manila day key in UTC on purpose: the key already
 * carries the merchant's day, so re-interpreting it in the browser's zone is
 * how the 19th comes to print as the 18th for a reader in London.
 */

import { toBusinessDayKey } from '@/lib/inventory/business-day'

/**
 * Spelled out rather than handed to `Intl`: the runtime's locale data decides
 * between "Sep" and "Sept" and changes its mind between ICU versions, which
 * is not a thing a date on a report should depend on.
 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** `14 Sep 2026` from any instant, read in UTC. */
function formatCalendarDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** `Today`, `Yesterday`, or `Mon, 14 Sep 2026`. */
export function formatDayLabel(dayKey: string, nowIso: string): string {
  const todayKey = toBusinessDayKey(nowIso)
  if (dayKey === todayKey) return 'Today'

  const yesterdayKey = toBusinessDayKey(
    new Date(Date.parse(`${todayKey}T12:00:00.000Z`) - 24 * 60 * 60 * 1000).toISOString(),
  )
  if (dayKey === yesterdayKey) return 'Yesterday'

  const date = new Date(`${dayKey}T00:00:00.000Z`)
  return `${WEEKDAYS[date.getUTCDay()]}, ${formatCalendarDate(date)}`
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
/** Past this, a relative gap stops meaning anything; give the date. */
const RELATIVE_CEILING_MS = 14 * DAY_MS

/** `Just now` / `12m ago` / `5h ago` / `3d ago`, then a plain date. */
export function formatLastActive(iso: string | null, nowMs: number): string {
  if (!iso) return 'No activity yet'

  const gap = nowMs - Date.parse(iso)
  if (Number.isNaN(gap)) return 'No activity yet'
  if (gap < MINUTE_MS) return 'Just now'
  if (gap < HOUR_MS) return `${Math.floor(gap / MINUTE_MS)}m ago`
  if (gap < DAY_MS) return `${Math.floor(gap / HOUR_MS)}h ago`
  if (gap < RELATIVE_CEILING_MS) return `${Math.floor(gap / DAY_MS)}d ago`

  return formatCalendarDate(new Date(iso))
}

/**
 * Two letters for an avatar, from a name or, failing that, an email.
 *
 * An email is cut at the `@` first: `ana@example.com` is one person called
 * Ana, not "A E".
 */
export function initialsOf(name: string): string {
  const source = name.includes('@') ? name.slice(0, name.indexOf('@')) : name
  const words = source.trim().split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

/** Hours Manila runs ahead of UTC — the same fixed offset business-day uses. */
const MANILA_OFFSET_MS = 8 * HOUR_MS

/**
 * `9:12 AM`, on the merchant's own clock.
 *
 * Fixed-offset arithmetic rather than `toLocaleTimeString`, for the same
 * reason the dates are spelled out: a shift that started at 9am must not read
 * as 1am because the browser is in London or the CI box is on UTC.
 */
export function formatClock(iso: string): string {
  const instant = Date.parse(iso)
  if (Number.isNaN(instant)) return '—'

  const local = new Date(instant + MANILA_OFFSET_MS)
  const hours24 = local.getUTCHours()
  const hours = hours24 % 12 === 0 ? 12 : hours24 % 12
  const minutes = String(local.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes} ${hours24 < 12 ? 'AM' : 'PM'}`
}
