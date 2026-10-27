/**
 * Sales broken down by dish, category, period and hour (plan §3.2, §5).
 *
 * Every row set is built from the sales model's lines and figures, so items,
 * categories, periods and hours each add up to net sales exactly. The SQL
 * report functions (`supabase/migrations/20261014110000_report_sales_functions.sql`)
 * mirror these rules for platform stores; `tests/unit/reports/report-sql-parity.property.test.ts`
 * fails if the two ever disagree by a centavo, so a rule changed here must be
 * changed there too.
 *
 * Labels never depend on the order rows were read in: a dish or category is
 * shown under the name of its most recent sale, a tie going to the first name
 * in code-point order.
 */

import { foldMethodName as foldName } from './payment-buckets'
import { MIDNIGHT_SCHEDULE, tradingDayOf, type CutoffSchedule } from '@/lib/business-day/trading-day'
import { bucketKey, type ReportGrain } from './period'
import { orderFigures, orderLineFigures, type LineFigures, type ReportOrder } from './sales-model'

export const UNCATEGORISED_LABEL = 'Uncategorised'
export const UNRECORDED_KEY = 'unrecorded'
export const UNCATEGORISED_KEY = 'uncategorised'

export interface BreakdownRow {
  key: string
  label: string
  /** Live orders with at least one line in the row. */
  orders: number
  quantity: number
  grossCents: number
  discountCents: number
  netCents: number
}

export interface ItemRow extends BreakdownRow {
  menuItemId: string | null
  /** The category it was most recently sold under; null when never known. */
  categoryLabel: string | null
  isUnrecorded: boolean
}

export interface CategoryRow extends BreakdownRow {
  isUnrecorded: boolean
  isUncategorised: boolean
}

export interface PeriodRow {
  /** `bucketKey` of the period's grain. */
  key: string
  orders: number
  grossCents: number
  discountCents: number
  netCents: number
  billedCents: number
  collectedCents: number
}

export interface HourCell {
  /** ISO weekday, Monday = 1. */
  weekday: number
  /** Manila hour, 0–23. */
  hour: number
  orders: number
  netCents: number
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

export function itemKey(line: Pick<LineFigures, 'menuItemId' | 'name' | 'isUnrecorded'>): string {
  if (line.isUnrecorded) return UNRECORDED_KEY
  return line.menuItemId ? `id:${line.menuItemId}` : `name:${foldName(line.name)}`
}

export function categoryKey(line: Pick<LineFigures, 'categoryName' | 'isUnrecorded'>): string {
  if (line.isUnrecorded) return UNRECORDED_KEY
  const name = line.categoryName?.trim()
  return name ? `name:${foldName(name)}` : UNCATEGORISED_KEY
}

interface Named {
  label: string
  at: number
}

/** Most recent first; a tie goes to the first label in code-point order. */
function isNewer(candidate: Named, current: Named): boolean {
  if (candidate.at !== current.at) return candidate.at > current.at
  return candidate.label < current.label
}

function newest(current: Named | undefined, candidate: Named): Named {
  return !current || isNewer(candidate, current) ? candidate : current
}

interface Group<Extra> {
  row: BreakdownRow
  name: Named
  extra: Extra
}

function codePointOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Largest first, then label, then key: a total order, so two readers list rows alike. */
export function byNetThenLabel(a: Pick<BreakdownRow, 'netCents' | 'label' | 'key'>, b: Pick<BreakdownRow, 'netCents' | 'label' | 'key'>): number {
  return b.netCents - a.netCents || codePointOrder(a.label, b.label) || codePointOrder(a.key, b.key)
}

function rollup<Extra>(
  orders: readonly ReportOrder[],
  keyOf: (line: LineFigures) => string,
  labelOf: (line: LineFigures) => string,
  extraOf: (line: LineFigures, at: number, previous: Extra | undefined) => Extra,
): Array<{ row: BreakdownRow; extra: Extra }> {
  const groups = new Map<string, Group<Extra>>()
  // Local accumulator (never escapes): copying a set per line would be quadratic.
  const ordersByKey = new Map<string, Set<string>>()
  for (const order of orders) {
    for (const line of orderLineFigures(order)) {
      const key = keyOf(line)
      const previous = groups.get(key)
      const name = newest(previous?.name, { label: labelOf(line), at: order.at })
      const orderIds = ordersByKey.get(key) ?? new Set<string>()
      ordersByKey.set(key, orderIds.add(order.id))
      const base = previous?.row
      groups.set(key, {
        name,
        extra: extraOf(line, order.at, previous?.extra),
        row: {
          key,
          label: name.label,
          orders: orderIds.size,
          quantity: (base?.quantity ?? 0) + line.quantity,
          grossCents: (base?.grossCents ?? 0) + line.grossCents,
          discountCents: (base?.discountCents ?? 0) + line.discountCents,
          netCents: (base?.netCents ?? 0) + line.netCents,
        },
      })
    }
  }
  return [...groups.values()].map(({ row, extra }) => ({ row, extra })).sort((a, b) => byNetThenLabel(a.row, b.row))
}

interface ItemExtra {
  menuItemId: string | null
  isUnrecorded: boolean
  category: Named | undefined
}

export function rollupItems(orders: readonly ReportOrder[]): ItemRow[] {
  return rollup<ItemExtra>(
    orders,
    itemKey,
    (line) => line.name,
    (line, at, previous) => {
      const category = line.categoryName?.trim()
      return {
        menuItemId: line.isUnrecorded ? null : line.menuItemId,
        isUnrecorded: line.isUnrecorded,
        category: category ? newest(previous?.category, { label: category, at }) : previous?.category,
      }
    },
  ).map(({ row, extra }) => ({
    ...row,
    menuItemId: extra.menuItemId,
    categoryLabel: extra.category?.label ?? null,
    isUnrecorded: extra.isUnrecorded,
  }))
}

export function rollupCategories(orders: readonly ReportOrder[]): CategoryRow[] {
  return rollup<null>(
    orders,
    categoryKey,
    (line) => (line.isUnrecorded ? line.name : line.categoryName?.trim() || UNCATEGORISED_LABEL),
    () => null,
  ).map(({ row }) => ({
    ...row,
    isUnrecorded: row.key === UNRECORDED_KEY,
    isUncategorised: row.key === UNCATEGORISED_KEY,
  }))
}

/**
 * Live orders per period bucket, oldest first. Day / week / month follow the
 * business day of `schedule` (no rows = Manila midnight); hour is wall clock.
 * SQL twin: report_sales_by_period (20261027140000).
 */
export function rollupPeriods(
  orders: readonly ReportOrder[],
  grain: ReportGrain,
  schedule: CutoffSchedule = MIDNIGHT_SCHEDULE,
): PeriodRow[] {
  const rows = new Map<string, PeriodRow>()
  for (const order of orders) {
    const figures = orderFigures(order)
    if (!figures.isLive) continue
    const key = bucketKey(order.at, grain, schedule)
    const base = rows.get(key)
    rows.set(key, {
      key,
      orders: (base?.orders ?? 0) + 1,
      grossCents: (base?.grossCents ?? 0) + figures.grossCents,
      discountCents: (base?.discountCents ?? 0) + figures.discountCents,
      netCents: (base?.netCents ?? 0) + figures.netCents,
      billedCents: (base?.billedCents ?? 0) + figures.billedCents,
      collectedCents: (base?.collectedCents ?? 0) + figures.collectedCents,
    })
  }
  return [...rows.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

export function manilaWeekdayHour(ms: number): { weekday: number; hour: number } {
  const local = new Date(ms + MANILA_OFFSET_MS)
  const day = local.getUTCDay()
  return { weekday: day === 0 ? 7 : day, hour: local.getUTCHours() }
}

/** ISO weekday (Monday = 1) of a 'YYYY-MM-DD' day key. */
function isoWeekdayOf(dayKey: string): number {
  const day = new Date(`${dayKey}T00:00:00.000Z`).getUTCDay()
  return day === 0 ? 7 : day
}

/**
 * Live orders by business-day weekday × wall-clock hour, Monday 00:00 first.
 * With no cutoff the weekday is the Manila calendar weekday. SQL twin:
 * report_sales_by_hour (20261027140000).
 */
export function rollupHours(orders: readonly ReportOrder[], schedule: CutoffSchedule = MIDNIGHT_SCHEDULE): HourCell[] {
  const cells = new Map<number, HourCell>()
  for (const order of orders) {
    const figures = orderFigures(order)
    if (!figures.isLive) continue
    const { hour } = manilaWeekdayHour(order.at)
    const weekday = isoWeekdayOf(tradingDayOf(new Date(order.at).toISOString(), schedule))
    const index = weekday * 24 + hour
    const base = cells.get(index)
    cells.set(index, {
      weekday,
      hour,
      orders: (base?.orders ?? 0) + 1,
      netCents: (base?.netCents ?? 0) + figures.netCents,
    })
  }
  return [...cells.entries()].sort(([a], [b]) => a - b).map(([, cell]) => cell)
}
