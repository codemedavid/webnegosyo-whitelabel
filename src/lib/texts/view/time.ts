/**
 * Every date and clock the Texts page shows, in Philippine time (UTC+8, no
 * DST — a fixed offset is exact). The page never reads the browser's zone:
 * an owner abroad still sees the store's clock. Pure.
 */

const MANILA_OFFSET_MS = 8 * 3_600_000
const DAY_MS = 86_400_000
const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const SAME_WEEK_DAYS = 6
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function local(at: number): Date {
  return new Date(at + MANILA_OFFSET_MS)
}

/** Days since the epoch on the Manila calendar. */
export function manilaDay(at: number): number {
  return Math.floor((at + MANILA_OFFSET_MS) / DAY_MS)
}

export function toMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const at = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(at) ? at : null
}

/** "2:30 PM". */
export function clockText(at: number): string {
  const date = local(at)
  const hours = date.getUTCHours()
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
}

/** "YYYY-MM-DD" on the Manila calendar. */
export function manilaToday(at: number): string {
  return local(at).toISOString().slice(0, 10)
}

/** "HH:MM" Manila wall clock. */
export function manilaHhmm(at: number): string {
  return local(at).toISOString().slice(11, 16)
}

/** The instant of a Manila calendar date + wall clock. */
export function manilaInstant(date: string, hhmm: string): number {
  return Date.parse(`${date}T${hhmm}:00Z`) - MANILA_OFFSET_MS
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** "Wed, Oct 14". */
export function weekdayDateText(at: number): string {
  const date = local(at)
  return `${DAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`
}

/** "Oct 3" for a "YYYY-MM-DD". */
export function monthDayText(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

/** "Oct 3" for an instant. */
export function monthDayOf(at: number): string {
  const date = local(at)
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`
}

/** "Today" / "Yesterday" / "Mon, Oct 12" — the activity feed's day headers. */
export function dayHeaderText(at: number, now: number): string {
  const days = manilaDay(now) - manilaDay(at)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return weekdayDateText(at)
}

/** "just now" · "5 min ago" · "3 hrs ago" · "Yesterday, 2:30 PM" · "Mon, Oct 12". */
export function timeAgoText(iso: string | null, now: number): string {
  const at = toMs(iso)
  if (at === null) return ''
  const diff = Math.max(0, now - at)
  if (diff < MINUTE_MS) return 'just now'
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} min ago`
  const days = manilaDay(now) - manilaDay(at)
  if (days === 0) {
    const hours = Math.floor(diff / HOUR_MS)
    return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ago`
  }
  if (days === 1) return `Yesterday, ${clockText(at)}`
  return weekdayDateText(at)
}

/** A future instant as "around 3:10 PM" / "tomorrow around …" / "Fri around …" / "Oct 23 around …". */
export function finishText(at: number, now: number): string {
  const days = manilaDay(at) - manilaDay(now)
  const clock = clockText(at)
  if (days <= 0) return `around ${clock}`
  if (days === 1) return `tomorrow around ${clock}`
  if (days <= SAME_WEEK_DAYS) return `${DAYS[local(at).getUTCDay()]} around ${clock}`
  return `${monthDayOf(at)} around ${clock}`
}

/** "today 3:10 PM" style start label: "Fri, 10:00 AM" / "today, 3:00 PM" / "tomorrow, 9:00 AM". */
export function startText(at: number, now: number): string {
  const days = manilaDay(at) - manilaDay(now)
  if (days === 0) return `today, ${clockText(at)}`
  if (days === 1) return `tomorrow, ${clockText(at)}`
  if (days > 1 && days <= SAME_WEEK_DAYS) return `${DAYS[local(at).getUTCDay()]}, ${clockText(at)}`
  return `${monthDayOf(at)}, ${clockText(at)}`
}

/** "since 2:14 PM" today, else "since Mon, Oct 12". */
export function sinceText(at: number, now: number): string {
  return manilaDay(at) === manilaDay(now) ? clockText(at) : weekdayDateText(at)
}

/** "21:00" → "9pm", "07:30" → "7:30am". */
export function hourText(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm
  const suffix = h < 12 ? 'am' : 'pm'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, '0')}${suffix}`
}

/** "18:00" → "6:00 PM". */
export function time12h(hhmm: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!match) return hhmm
  const hours = Number(match[1])
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`
}

export function quietWindowText(rules: { quietHoursStart: string; quietHoursEnd: string }): string {
  return `${hourText(rules.quietHoursStart)}–${hourText(rules.quietHoursEnd)}`
}
