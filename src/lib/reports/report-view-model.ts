/**
 * Report rows → what the sales screens draw. Pure, so every figure a page
 * shows is tested here and the pages only lay it out.
 */

import { SALE_CHANNEL_LABELS, toOrderTypeLabel, toSaleChannel, type SaleChannel } from '@/lib/dashboard/sale-record'
import { formatMoney } from './format'
import type { InsightBucket } from './insights'
import { METRIC_GLOSSARY, type MetricKey } from './metric-glossary'
import { UNASSIGNED_BRANCH, bucketLabel, type ReportGrain } from './period'
import type { DimensionMapping, SalesTotals } from './read/report-rpc-rows'
import type { PeriodRow } from './sales-breakdowns'

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

export interface TrendPoint {
  key: string
  label: string
  currentCents: number
  /** null = no comparison for this bucket. */
  previousCents: number | null
}

export interface AlignTrendInput {
  grain: ReportGrain
  currentKeys: readonly string[]
  current: readonly PeriodRow[]
  /** null = comparison off. */
  previousKeys: readonly string[] | null
  previous: readonly PeriodRow[] | null
}

function netByKey(rows: readonly PeriodRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.key, row.netCents]))
}

/**
 * Every bucket of the period, zero-filled, beside the comparison bucket in the
 * same position (Monday beside last Monday, the 3rd beside the 3rd).
 */
export function alignTrend({ grain, currentKeys, current, previousKeys, previous }: AlignTrendInput): TrendPoint[] {
  const currentNet = netByKey(current)
  const previousNet = previous ? netByKey(previous) : null
  return currentKeys.map((key, index) => {
    const previousKey = previousKeys?.[index]
    return {
      key,
      label: bucketLabel(key, grain),
      currentCents: currentNet.get(key) ?? 0,
      previousCents: previousNet && previousKey !== undefined ? (previousNet.get(previousKey) ?? 0) : null,
    }
  })
}

/** The sentence a screen reader hears instead of the chart. */
export function trendSummary(points: readonly TrendPoint[], seriesLabel: string): string {
  const total = points.reduce((sum, point) => sum + point.currentCents, 0)
  if (total === 0) return `${seriesLabel} by bucket: no sales in this period.`
  const best = points.reduce((top, point) => (point.currentCents > top.currentCents ? point : top))
  return `${seriesLabel} by bucket: ${formatMoney(total)} in total. Highest: ${best.label}, ${formatMoney(best.currentCents)}.`
}

export function insightBuckets(rows: readonly PeriodRow[], grain: ReportGrain): InsightBucket[] {
  return rows.map((row) => ({ key: row.key, label: bucketLabel(row.key, grain, 'spoken'), netCents: row.netCents }))
}

// ---------------------------------------------------------------------------
// Comparison per row
// ---------------------------------------------------------------------------

/**
 * Each row beside the same key's row last period. `previous` is null for a row
 * new this period, and undefined everywhere when the comparison is off.
 */
export function withPrevious<Row extends { key: string }>(
  rows: readonly Row[],
  previous: readonly Row[] | null,
): Array<Row & { previous: Row | null | undefined }> {
  const byKey = previous ? new Map(previous.map((row) => [row.key, row])) : null
  return rows.map((row) => ({ ...row, previous: byKey ? (byKey.get(row.key) ?? null) : undefined }))
}

// ---------------------------------------------------------------------------
// Totals ledger
// ---------------------------------------------------------------------------

export interface LedgerLine {
  key: MetricKey
  label: string
  cents: number
  /** The operator printed before the line; null starts a block. */
  sign: '+' | '−' | '=' | null
  isTotal: boolean
}

function line(key: MetricKey, cents: number, sign: LedgerLine['sign'], isTotal = false): LedgerLine {
  return { key, label: METRIC_GLOSSARY[key].term, cents, sign, isTotal }
}

/**
 * The totals in an order that adds up on screen (plan §10.1 invariants 1, 2,
 * 4): sales, then what was billed, then what came in.
 */
export function totalsLedger(totals: SalesTotals): LedgerLine[] {
  return [
    line('gross', totals.grossCents, null),
    line('discounts', totals.discountCents, '−'),
    line('net', totals.netCents, '=', true),
    line('service', totals.serviceCents, '+'),
    line('delivery', totals.deliveryCents, '+'),
    line('billed', totals.billedCents, '=', true),
    line('collected', totals.collectedCents, null),
    line('unpaid', totals.unpaidCents, '+'),
    ...(totals.overpaidCents > 0 ? [line('overpaid', totals.overpaidCents, '−')] : []),
    // Closes the third block: what came in plus what is owed is what was billed.
    line('billed', totals.billedCents, '=', true),
  ]
}

// ---------------------------------------------------------------------------
// Dimension mappings (raw stored values → the app's own groups)
// ---------------------------------------------------------------------------

export const channelMapping: DimensionMapping = {
  keyOf: (raw) => toSaleChannel(raw),
  labelOf: (key) => SALE_CHANNEL_LABELS[key as SaleChannel] ?? key,
}

export const orderTypeMapping: DimensionMapping = {
  keyOf: (raw) => toOrderTypeLabel(raw),
  labelOf: (key) => key,
}

export const UNASSIGNED_LABEL = 'Unassigned'
const REMOVED_BRANCH_LABEL = 'Removed branch'

export function outletMapping(names: ReadonlyMap<string, string>): DimensionMapping {
  return {
    keyOf: (raw) => raw ?? UNASSIGNED_BRANCH,
    labelOf: (key) => (key === UNASSIGNED_BRANCH ? UNASSIGNED_LABEL : (names.get(key) ?? REMOVED_BRANCH_LABEL)),
  }
}

// ---------------------------------------------------------------------------
// Breakdown pages
// ---------------------------------------------------------------------------

export const REPORT_BREAKDOWNS = ['items', 'categories', 'payments', 'channels', 'hours', 'branches'] as const
export type BreakdownSlug = (typeof REPORT_BREAKDOWNS)[number]

export interface BreakdownMeta {
  title: string
  /** The page's one job, as a question the owner asks. */
  question: string
}

export const BREAKDOWN_META: Readonly<Record<BreakdownSlug, BreakdownMeta>> = {
  items: { title: 'Items', question: 'Which dishes sell, and which ones carry the menu?' },
  categories: { title: 'Categories', question: 'Which parts of the menu bring in the money?' },
  payments: { title: 'Payments', question: 'How did customers pay, and what is still unpaid?' },
  channels: { title: 'Channels', question: 'Where do orders come from: counter, online, QR or app?' },
  hours: { title: 'Hours', question: 'When are you busiest, by day and hour?' },
  branches: { title: 'Branches', question: 'How does each branch compare?' },
}

export function isBreakdownSlug(value: string): value is BreakdownSlug {
  return (REPORT_BREAKDOWNS as readonly string[]).includes(value)
}

export interface BreakdownAudience {
  isMultiBranch: boolean
  isBranchLocked: boolean
}

/** Branches compares branches: only a store-wide account on a multi-branch store has more than one. */
export function breakdownsFor({ isMultiBranch, isBranchLocked }: BreakdownAudience): BreakdownSlug[] {
  return REPORT_BREAKDOWNS.filter((slug) => slug !== 'branches' || (isMultiBranch && !isBranchLocked))
}
