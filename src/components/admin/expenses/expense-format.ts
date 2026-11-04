/**
 * How the expense book writes money, days and times (plan §5.6).
 *
 * Pure. Money is integer centavos; dates are Asia/Manila business dates
 * (`YYYY-MM-DD`). Manila runs a fixed +08:00 (no DST since 1978), the same rule
 * `src/lib/inventory/business-day.ts` uses, so "today" here and in the
 * database agree.
 */

import { formatPeso as formatKeypadPeso } from '@/lib/expenses/keypad'
import { addDays, manilaDateOf, todayInManila } from '@/lib/expenses/manila-date'
import type { PaidFrom } from '@/lib/expenses/types'

const CENTS_PER_PESO = 100

const WHOLE = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })

/**
 * "₱1,250" in lists (decimals only when they aren't zero), "₱1,250.00" when
 * `exact` (detail, export). The keypad engine owns the format, so the web and
 * the app write money the same way.
 */
export function formatPeso(cents: number, options: { exact?: boolean } = {}): string {
  return formatKeypadPeso(cents, { decimals: options.exact ? 'always' : 'auto' })
}

/** Money out, in normal ink: "−₱1,250". Never coloured (plan §5.6). */
export function formatMoneyOut(cents: number): string {
  return `−${formatPeso(Math.abs(cents))}`
}

/** What a screen reader says for an amount: "1,250 pesos", "1,250 pesos and 50 centavos". */
export function pesoWords(cents: number): string {
  const abs = Math.abs(Math.round(cents))
  const pesos = Math.floor(abs / CENTS_PER_PESO)
  const centavos = abs % CENTS_PER_PESO
  const pesoPart = `${WHOLE.format(pesos)} ${pesos === 1 ? 'peso' : 'pesos'}`
  return centavos === 0 ? pesoPart : `${pesoPart} and ${centavos} ${centavos === 1 ? 'centavo' : 'centavos'}`
}

/** Today in Manila, `YYYY-MM-DD`. */
export function manilaToday(nowMs: number = Date.now()): string {
  return todayInManila(new Date(nowMs))
}

/** The Manila business date an instant falls on ('' when unreadable). */
export function manilaDayOf(iso: string): string {
  return Number.isNaN(Date.parse(iso)) ? '' : manilaDateOf(iso)
}

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/

export interface MonthRange {
  /** `YYYY-MM`. */
  key: string
  /** First day, `YYYY-MM-DD`. */
  from: string
  /** Last day, `YYYY-MM-DD` (inclusive). */
  to: string
  /** "October 2026". */
  label: string
  /** "October". */
  monthName: string
  isCurrent: boolean
  /** Later than this month: nothing can be recorded there yet. */
  isFuture: boolean
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const MONTH_NAME = new Intl.DateTimeFormat('en-PH', { month: 'long', timeZone: 'UTC' })

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * The month a `?month=YYYY-MM` asks for. Anything unreadable is this month
 * (Manila), so a bad link still opens the book.
 */
export function resolveMonth(requested: string | null | undefined, today: string): MonthRange {
  const currentKey = today.slice(0, 7)
  const match = typeof requested === 'string' ? MONTH_KEY.exec(requested) : null
  const key = match ? requested! : currentKey
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  const last = String(lastDayOfMonth(year, month)).padStart(2, '0')
  const firstDate = new Date(Date.UTC(year, month - 1, 1))
  return {
    key,
    from: `${key}-01`,
    to: `${key}-${last}`,
    label: MONTH_LABEL.format(firstDate),
    monthName: MONTH_NAME.format(firstDate),
    isCurrent: key === currentKey,
    isFuture: key > currentKey,
  }
}

/** `YYYY-MM` shifted by `delta` months. */
export function shiftMonth(key: string, delta: number): string {
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7)) - 1 + delta
  const date = new Date(Date.UTC(year, month, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const DAY_LABEL = new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const LONG_DAY_LABEL = new Intl.DateTimeFormat('en-PH', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "Today", "Yesterday", else "Mon, Oct 19". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === addDays(today, -1)) return 'Yesterday'
  const instant = Date.parse(`${day}T00:00:00Z`)
  return Number.isNaN(instant) ? day : DAY_LABEL.format(new Date(instant))
}

/** "Monday, October 19, 2026". */
export function longDayLabel(day: string): string {
  const instant = Date.parse(`${day}T00:00:00Z`)
  return Number.isNaN(instant) ? day : LONG_DAY_LABEL.format(new Date(instant))
}

const TIME_LABEL = new Intl.DateTimeFormat('en-PH', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Manila',
})

/** "9:42 AM" in Manila. */
export function timeLabel(iso: string): string {
  const instant = Date.parse(iso)
  return Number.isNaN(instant) ? '' : TIME_LABEL.format(new Date(instant)).replace(/ /g, ' ')
}

const STAMP_LABEL = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Manila',
})

/** "Oct 19, 9:42 AM" in Manila. */
export function stampLabel(iso: string): string {
  const instant = Date.parse(iso)
  return Number.isNaN(instant) ? '' : STAMP_LABEL.format(new Date(instant)).replace(/ /g, ' ')
}

/** Where the money came from, as the owner says it. GCash and Maya are words, never logos. */
export const PAID_FROM_LABELS: Readonly<Record<PaidFrom, string>> = {
  drawer: 'Drawer',
  cash: 'Cash on hand',
  gcash: 'GCash',
  maya: 'Maya',
  bank: 'Bank',
  card: 'Card',
  owner: 'Owner’s pocket',
}

/** The web never records a drawer expense: the cashier does, from the till. */
export const WEB_PAID_FROM: readonly Exclude<PaidFrom, 'drawer'>[] = ['cash', 'gcash', 'maya', 'bank', 'card', 'owner']
