/**
 * Times in the Orders table, always on the store's clock (Asia/Manila), never
 * the browser's: a merchant travelling, or a laptop on UTC, still reads the
 * time the kitchen saw.
 *
 * Pure: `nowMs` is passed in.
 */

const TIME = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true })
const DAY = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })

export interface OrderTimeLabel {
  /** "12:41 PM". */
  time: string
  /** "Nov 20" when the order is not from today (Manila calendar), else null. */
  day: string | null
}

export function orderTimeLabel(createdAtMs: number, nowMs: number): OrderTimeLabel {
  if (!Number.isFinite(createdAtMs)) return { time: '—', day: null }
  const at = new Date(createdAtMs)
  const isToday = DAY_KEY.format(at) === DAY_KEY.format(new Date(nowMs))
  return { time: TIME.format(at).replace(/\s?([ap])\.?m\.?$/i, (_, p: string) => ` ${p.toUpperCase()}M`), day: isToday ? null : DAY.format(at) }
}

/** "just now", "8 min", "1 h 20 min", "2 d" — how long an open order has waited. */
export function waitingLabel(createdAtMs: number, nowMs: number): string {
  const minutes = Math.floor((nowMs - createdAtMs) / 60_000)
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
  }
  return `${Math.floor(hours / 24)} d`
}

/** A new order nobody has answered for this long is shown as late. */
export const LATE_NEW_ORDER_MINUTES = 10

export function isLateNewOrder(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs >= LATE_NEW_ORDER_MINUTES * 60_000
}
