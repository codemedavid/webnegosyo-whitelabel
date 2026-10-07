/**
 * The collections roster laid out as a month: who to ask for money, and when.
 *
 * Pure, like the roster it reads. A subscriber sits on the day their payment
 * falls due — the first day their paid-through date does not cover — and a
 * payment already recorded sits on the day its period started, so one grid
 * answers both "who still owes this month" and "who already settled".
 *
 * Due dates are never projected forward. A client due on the 9th who has not
 * paid is late, not "due again on the 9th of next month"; drawing the second
 * date would make a debt look like a renewal still on schedule.
 */

import type { RosterRow } from '@/lib/billing/subscription-roster'
import type { CollectionsInsight } from '@/lib/billing/collections-insight'
import type { PaymentLedgerRow } from '@/lib/billing/payment-history'
import { addDays } from '@/lib/billing/subscription-status'

export type CalendarEntryKind = 'paid' | 'overdue' | 'due_today' | 'upcoming' | 'never_billed'

export interface CalendarEntry {
  /** Unique within one calendar, for React keys. */
  key: string
  tenantId: string
  name: string
  slug: string
  kind: CalendarEntryKind
  /** The day the money falls due (or the paid period started); null when never billed. */
  dueDayKey: string | null
  /** The price for a due entry, the amount received for a paid one. */
  amountPhp: number
  /** Same count as the Subscriptions screen: whole days past paid-through. 0 unless overdue. */
  daysLate: number
  /** No payment in the ledger yet — this is the client's first ask. */
  isFirstPayment: boolean
  /** Readable and no order in 30 days: chasing it is tidying up, not collecting. */
  isDormant: boolean
  paidThroughDayKey: string | null
  anchorDayKey: string | null
  monthlyPricePhp: number
}

export interface CalendarDay {
  dayKey: string
  dayOfMonth: number
  isInMonth: boolean
  isToday: boolean
  entries: CalendarEntry[]
}

export interface CalendarTotals {
  /** Unpaid due dates inside the month (late, today and still to come). */
  dueCount: number
  duePhp: number
  /** The part of `due*` whose date has already passed. */
  overdueCount: number
  overduePhp: number
  /** Payments recorded for periods starting inside the month. */
  paidCount: number
  paidPhp: number
}

export interface CollectionsCalendar {
  /** `YYYY-MM`. */
  monthKey: string
  /** Sunday-first weeks covering the whole month. */
  weeks: CalendarDay[][]
  /** Ring these today: due today, then late (longest first), then trading but never billed. */
  askNow: CalendarEntry[]
  /** Late, but the store has stopped trading. Kept apart rather than hidden. */
  dormantOwing: CalendarEntry[]
  totals: CalendarTotals
}

export interface CollectionsCalendarInput {
  rows: readonly RosterRow[]
  /** Absent when the ledger could not be read: nobody is labelled a first payment. */
  insights?: Readonly<Record<string, CollectionsInsight>>
  /** Absent when the ledger could not be read: no day shows as paid. */
  ledger?: readonly PaymentLedgerRow[]
  monthKey: string
  todayKey: string
}

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const DAYS_PER_WEEK = 7

/** A valid `YYYY-MM` from a search param, or the month `todayKey` falls in. */
export function parseMonthKey(value: unknown, todayKey: string): string {
  return typeof value === 'string' && MONTH_KEY_PATTERN.test(value) ? value : todayKey.slice(0, 7)
}

/** The month `delta` months after `monthKey`. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1))
  return shifted.toISOString().slice(0, 7)
}

/** The first day a subscriber's paid period does not cover, or null when never billed. */
export function dueDayKeyOf(row: RosterRow): string | null {
  return row.paidThroughDayKey ? addDays(row.paidThroughDayKey, 1) : null
}

function daysBetween(fromDayKey: string, toDayKey: string): number {
  const from = Date.parse(`${fromDayKey}T00:00:00.000Z`)
  const to = Date.parse(`${toDayKey}T00:00:00.000Z`)
  return Math.round((to - from) / MILLISECONDS_PER_DAY)
}

function toAmount(value: number | string | null): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}

function buildGridDayKeys(monthKey: string): string[] {
  const firstOfMonth = `${monthKey}-01`
  const lastOfMonth = addDays(`${shiftMonthKey(monthKey, 1)}-01`, -1)
  const firstWeekday = new Date(`${firstOfMonth}T00:00:00.000Z`).getUTCDay()
  const lastWeekday = new Date(`${lastOfMonth}T00:00:00.000Z`).getUTCDay()
  const start = addDays(firstOfMonth, -firstWeekday)
  const end = addDays(lastOfMonth, DAYS_PER_WEEK - 1 - lastWeekday)
  const length = daysBetween(start, end) + 1
  return Array.from({ length }, (_, index) => addDays(start, index))
}

function baseEntry(row: RosterRow, insight: CollectionsInsight | undefined) {
  return {
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    isFirstPayment: insight?.hasNeverPaid ?? false,
    isDormant: insight?.isDormant ?? false,
    paidThroughDayKey: row.paidThroughDayKey,
    anchorDayKey: row.anchorDayKey,
    monthlyPricePhp: row.monthlyPricePhp,
  }
}

/** The one open ask for a subscriber, or null when there is nothing to ask. */
function toDueEntry(
  row: RosterRow,
  insight: CollectionsInsight | undefined,
  todayKey: string
): CalendarEntry | null {
  if (row.manualBlock === 'cancelled') return null

  const dueDayKey = dueDayKeyOf(row)
  if (!dueDayKey) {
    if (!row.isUnbilled) return null
    return {
      ...baseEntry(row, insight),
      key: `never_billed:${row.tenantId}`,
      kind: 'never_billed',
      dueDayKey: null,
      amountPhp: row.monthlyPricePhp,
      daysLate: 0,
    }
  }

  const kind: CalendarEntryKind =
    dueDayKey > todayKey ? 'upcoming' : dueDayKey === todayKey ? 'due_today' : 'overdue'

  return {
    ...baseEntry(row, insight),
    key: `due:${row.tenantId}`,
    kind,
    dueDayKey,
    amountPhp: row.monthlyPricePhp,
    // Computed from the dates rather than read off the row: the roster reports
    // 0 for a manually paused client however stale their date is.
    daysLate: kind === 'overdue' && row.paidThroughDayKey ? daysBetween(row.paidThroughDayKey, todayKey) : 0,
  }
}

function toPaidEntries(
  ledger: readonly PaymentLedgerRow[],
  rowsByTenant: ReadonlyMap<string, RosterRow>,
  insights: CollectionsCalendarInput['insights'],
  firstDayKey: string,
  lastDayKey: string
): CalendarEntry[] {
  return ledger.flatMap((payment, index) => {
    const row = rowsByTenant.get(payment.tenant_id)
    const dayKey = payment.period_start
    if (!row || !dayKey || dayKey < firstDayKey || dayKey > lastDayKey) return []
    return [
      {
        ...baseEntry(row, insights?.[row.tenantId]),
        key: `paid:${row.tenantId}:${index}`,
        kind: 'paid' as const,
        dueDayKey: dayKey,
        amountPhp: toAmount(payment.amount_php),
        daysLate: 0,
        // It has been paid, so it is nobody's first ask any more.
        isFirstPayment: false,
      },
    ]
  })
}

const ASK_ORDER: Record<CalendarEntryKind, number> = {
  due_today: 0,
  overdue: 1,
  never_billed: 2,
  upcoming: 3,
  paid: 4,
}

function compareAsks(a: CalendarEntry, b: CalendarEntry): number {
  const byKind = ASK_ORDER[a.kind] - ASK_ORDER[b.kind]
  if (byKind !== 0) return byKind
  const byLate = b.daysLate - a.daysLate
  if (byLate !== 0) return byLate
  return a.name.localeCompare(b.name)
}

function isAsk(entry: CalendarEntry): boolean {
  return entry.kind === 'due_today' || entry.kind === 'overdue'
}

function sumTotals(entries: readonly CalendarEntry[]): CalendarTotals {
  return entries.reduce<CalendarTotals>(
    (totals, entry) => {
      if (entry.kind === 'paid') {
        return { ...totals, paidCount: totals.paidCount + 1, paidPhp: totals.paidPhp + entry.amountPhp }
      }
      const isOverdue = entry.kind === 'overdue'
      return {
        ...totals,
        dueCount: totals.dueCount + 1,
        duePhp: totals.duePhp + entry.amountPhp,
        overdueCount: totals.overdueCount + (isOverdue ? 1 : 0),
        overduePhp: totals.overduePhp + (isOverdue ? entry.amountPhp : 0),
      }
    },
    { dueCount: 0, duePhp: 0, overdueCount: 0, overduePhp: 0, paidCount: 0, paidPhp: 0 }
  )
}

export function buildCollectionsCalendar(input: CollectionsCalendarInput): CollectionsCalendar {
  const { rows, insights, ledger, monthKey, todayKey } = input
  const gridDayKeys = buildGridDayKeys(monthKey)
  const firstDayKey = gridDayKeys[0]
  const lastDayKey = gridDayKeys[gridDayKeys.length - 1]

  const dueEntries = rows.flatMap((row) => {
    const entry = toDueEntry(row, insights?.[row.tenantId], todayKey)
    return entry ? [entry] : []
  })
  const rowsByTenant = new Map(rows.map((row) => [row.tenantId, row]))
  const paidEntries = ledger ? toPaidEntries(ledger, rowsByTenant, insights, firstDayKey, lastDayKey) : []

  const entriesByDay = new Map<string, CalendarEntry[]>()
  for (const entry of [...dueEntries, ...paidEntries]) {
    if (!entry.dueDayKey || entry.dueDayKey < firstDayKey || entry.dueDayKey > lastDayKey) continue
    entriesByDay.set(entry.dueDayKey, [...(entriesByDay.get(entry.dueDayKey) ?? []), entry])
  }

  const days: CalendarDay[] = gridDayKeys.map((dayKey) => ({
    dayKey,
    dayOfMonth: Number(dayKey.slice(8, 10)),
    isInMonth: dayKey.startsWith(monthKey),
    isToday: dayKey === todayKey,
    entries: [...(entriesByDay.get(dayKey) ?? [])].sort(compareAsks),
  }))

  const weeks = Array.from({ length: days.length / DAYS_PER_WEEK }, (_, week) =>
    days.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK)
  )

  // A never-billed store only earns a place on the list by trading: most of
  // them are demos and abandoned sign-ups, and a 100-name list is not a to-do.
  const askNow = dueEntries
    .filter(
      (entry) =>
        (isAsk(entry) && !entry.isDormant) ||
        (entry.kind === 'never_billed' && insights?.[entry.tenantId]?.isTrading === true)
    )
    .sort(compareAsks)
  const dormantOwing = dueEntries.filter((entry) => isAsk(entry) && entry.isDormant).sort(compareAsks)

  const inMonthEntries = days.filter((day) => day.isInMonth).flatMap((day) => day.entries)

  return { monthKey, weeks, askNow, dormantOwing, totals: sumTotals(inMonthEntries) }
}
