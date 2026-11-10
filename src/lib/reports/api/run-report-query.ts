/**
 * Answers one report query (plan 2026-11-05 §5.4): the sections a screen
 * asked for, each read for the period and, when comparing, for the period it
 * is compared with. Every value is a registry metric (`metrics/compute.ts`),
 * so the app renders numbers and never computes one.
 *
 * Reads go through the CALLER's session client only (`report-rpc.ts`): RLS
 * and the staff keys decide what comes back. A section that fails or is
 * refused says so on its own; the others still answer.
 */

import { buildProfitReport, ingredientBasisOf, profitTrend, type ProfitReport } from '../profit-model'
import type { SalesTotals } from '../read/report-rpc-rows'
import { PROFIT_GRAINS, type ProfitGrain } from '../profit-facts'
import { bucketKeys, bucketLabel, type ReportGrain } from '../period'
import { channelMapping, orderTypeMapping, outletMapping } from '../report-view-model'
import type { ReportContext } from '../read/report-context'
import {
  readCategories,
  readDimension,
  readExpenseCategories,
  readHours,
  readItems,
  readPayments,
  readPeriods,
  readProfitPeriods,
  readProfitSummary,
  readTotals,
  PROFIT_FORBIDDEN_MESSAGE,
  type ReportDimension,
  type ReportFailure,
  type ReportResult,
  type ReportRpcClient,
  type ReportWindow,
} from '../read/report-rpc'
import type { DimensionMapping } from '../read/report-rpc-rows'
import type { BreakdownRow, ItemRow } from '../sales-breakdowns'
import { breakdownValues, paymentValues, periodValues, profitMetricValues, summaryValues, type MetricValues } from '../metrics/compute'
import type { ReportSection } from './query-schema'

const DAY_MS = 24 * 60 * 60 * 1000
/**
 * Report calls one request may have open at once. A year is a dozen month
 * calls per section and window; unbounded, six sections compared with last
 * year opened ~36 at once on the database every store shares.
 */
export const MAX_CONCURRENT_REPORT_CALLS = 6
/** Hour bars only for short periods: a year of hours is far past the 1000-row API cap. */
const MAX_HOUR_GRAIN_DAYS = 7

export interface ReportRow {
  key: string
  label: string
  values: MetricValues
  /** The same row in the compared period: null = it had none; absent = not comparing. */
  previous?: MetricValues | null
  /** Items only. */
  categoryLabel?: string | null
  isUnrecorded?: boolean
}

export interface SummarySection {
  days: number
  values: MetricValues
  previous: MetricValues | null
}

export interface PeriodsSection {
  grain: ReportGrain
  rows: ReportRow[]
}

export interface ProfitSection {
  values: MetricValues
  previous: MetricValues | null
  ingredientBasis: ProfitReport['ingredientBasis']
  findings: string[]
}

export interface HoursSection {
  cells: Array<{ weekday: number; hour: number; values: MetricValues }>
}

export interface ReportSections {
  summary?: ReportResult<SummarySection>
  periods?: ReportResult<PeriodsSection>
  items?: ReportResult<{ rows: ReportRow[] }>
  categories?: ReportResult<{ rows: ReportRow[] }>
  payments?: ReportResult<{ rows: ReportRow[] }>
  channels?: ReportResult<{ rows: ReportRow[] }>
  order_types?: ReportResult<{ rows: ReportRow[] }>
  branches?: ReportResult<{ rows: ReportRow[] }>
  hours?: ReportResult<HoursSection>
  profit?: ReportResult<ProfitSection>
}

export interface RunReportQueryInput {
  context: ReportContext
  client: ReportRpcClient
  sections: readonly ReportSection[]
  grain?: ReportGrain
  /** The caller holds `costs`; without it profit is refused before anything is read (cached months included). Default: no. */
  canSeeCosts?: boolean
}

interface Windows {
  current: ReportWindow
  previous: ReportWindow | null
}

function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1
}

function both<T>(windows: Windows, read: (window: ReportWindow) => Promise<ReportResult<T>>): Promise<[ReportResult<T>, ReportResult<T> | null]> {
  return Promise.all([read(windows.current), windows.previous ? read(windows.previous) : Promise.resolve(null)])
}

/** The same client, but never more than `max` calls in flight; the rest wait their turn in order. */
export function limitReportCalls(client: ReportRpcClient, max: number): ReportRpcClient {
  let active = 0
  const waiting: Array<() => void> = []
  const acquire = (): Promise<void> => {
    if (active < max) {
      active += 1
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => waiting.push(resolve))
  }
  const release = (): void => {
    const next = waiting.shift()
    // The slot passes straight to the next waiter, so `active` stays the same.
    if (next) next()
    else active -= 1
  }
  return {
    rpc: async (fn, args) => {
      await acquire()
      try {
        return await client.rpc(fn, args)
      } finally {
        release()
      }
    },
  }
}

function okOrNull<T>(result: ReportResult<T> | null): T | null {
  return result?.ok ? result.data : null
}

function toRows<Row extends BreakdownRow>(current: readonly Row[], previous: readonly Row[] | null, comparing: boolean): ReportRow[] {
  const totalNet = current.reduce((sum, row) => sum + row.netCents, 0)
  const previousNet = previous?.reduce((sum, row) => sum + row.netCents, 0) ?? 0
  const previousByKey = previous ? new Map(previous.map((row) => [row.key, row])) : null
  return current.map((row) => {
    const before = previousByKey?.get(row.key)
    const item = row as Partial<ItemRow>
    return {
      key: row.key,
      label: row.label,
      values: breakdownValues(row, totalNet),
      ...(comparing ? { previous: before ? breakdownValues(before, previousNet) : null } : {}),
      ...('categoryLabel' in row ? { categoryLabel: item.categoryLabel ?? null, isUnrecorded: item.isUnrecorded ?? false } : {}),
    }
  })
}

/** Σ pieces sold in each window, from the raw rows (a dish sold only in the compared period counts there too). */
interface PiecesSold {
  current: number
  previous: number | null
}

interface BreakdownRead {
  section: ReportResult<{ rows: ReportRow[] }>
  sold: PiecesSold | null
}

const sumQuantity = (rows: readonly BreakdownRow[]): number => rows.reduce((sum, row) => sum + row.quantity, 0)

async function readBreakdown<Row extends BreakdownRow>(
  windows: Windows,
  read: (window: ReportWindow) => Promise<ReportResult<Row[]>>,
): Promise<BreakdownRead> {
  const [current, previous] = await both(windows, read)
  if (!current.ok) return { section: current, sold: null }
  const before = okOrNull(previous)
  return {
    section: { ok: true, data: { rows: toRows(current.data, before, windows.previous !== null) } },
    sold: { current: sumQuantity(current.data), previous: before ? sumQuantity(before) : null },
  }
}

async function breakdownSection<Row extends BreakdownRow>(
  windows: Windows,
  read: (window: ReportWindow) => Promise<ReportResult<Row[]>>,
): Promise<ReportResult<{ rows: ReportRow[] }>> {
  return (await readBreakdown(windows, read)).section
}

function dimensionSection(windows: Windows, client: ReportRpcClient, dimension: ReportDimension, mapping: DimensionMapping) {
  return breakdownSection(windows, (window) => readDimension(client, window, dimension, mapping))
}

async function readProfitReport(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<ProfitReport>> {
  const [figures, categories] = await Promise.all([readProfitSummary(client, window), readExpenseCategories(client, window)])
  if (!figures.ok) return figures
  if (!categories.ok) return categories
  return { ok: true, data: buildProfitReport({ figures: figures.data, categories: categories.data, previousCategories: null }) }
}

async function profitSection(windows: Windows, client: ReportRpcClient): Promise<ReportResult<ProfitSection>> {
  const [current, previous] = await both(windows, (window) => readProfitReport(client, window))
  if (!current.ok) return current
  const before = okOrNull(previous)
  return {
    ok: true,
    data: {
      values: profitMetricValues(current.data),
      previous: before ? profitMetricValues(before) : null,
      ingredientBasis: current.data.ingredientBasis,
      findings: current.data.findings.map((finding) => finding.kind),
    },
  }
}

function buildSummary(
  [current, previous]: [ReportResult<SalesTotals>, ReportResult<SalesTotals> | null],
  days: number,
  itemsSold: PiecesSold | null,
): ReportResult<SummarySection> {
  if (!current.ok) return current
  const before = okOrNull(previous)
  return {
    ok: true,
    data: {
      days,
      values: summaryValues({ totals: current.data, days, itemsSold: itemsSold?.current }),
      previous: before ? summaryValues({ totals: before, days, itemsSold: itemsSold?.previous ?? undefined }) : null,
    },
  }
}

function effectiveGrain(context: ReportContext, requested: ReportGrain | undefined, days: number): ReportGrain {
  if (!requested) return context.period.grain
  return requested === 'hour' && days > MAX_HOUR_GRAIN_DAYS ? context.period.grain : requested
}

function isProfitGrain(grain: ReportGrain): grain is ProfitGrain {
  return (PROFIT_GRAINS as readonly string[]).includes(grain)
}

async function periodsSection(
  windows: Windows,
  context: ReportContext,
  client: ReportRpcClient,
  grain: ReportGrain,
  withProfit: boolean,
): Promise<ReportResult<PeriodsSection>> {
  const profitGrain = withProfit && isProfitGrain(grain) ? grain : null
  const [[current, previous], profit] = await Promise.all([
    both(windows, (window) => readPeriods(client, window, grain)),
    profitGrain ? readProfitPeriods(client, windows.current, profitGrain) : Promise.resolve(null),
  ])
  if (!current.ok) return current
  const { period, compare, schedule } = context
  const keys = bucketKeys(period.start, period.end, grain, schedule)
  const previousKeys = compare && windows.previous ? bucketKeys(compare.start, compare.end, grain, schedule) : null
  const byKey = new Map(current.data.map((row) => [row.key, row]))
  const before = okOrNull(previous)
  const previousByKey = before ? new Map(before.map((row) => [row.key, row])) : null
  // The window's basis (recipes when any sale moved stock), as the Profit page uses.
  const basis = profit?.ok ? ingredientBasisOf(profit.data.reduce((sum, row) => sum + row.saleMovements, 0)) : null
  const trend = profit?.ok && basis ? new Map(profitTrend(keys, profit.data, basis).map((point) => [point.bucket, point])) : null
  const empty = (key: string) => ({ key, orders: 0, grossCents: 0, discountCents: 0, netCents: 0, billedCents: 0, collectedCents: 0 })
  const rows = keys.map((key, index): ReportRow => {
    const previousKey = previousKeys?.[index]
    return {
      key,
      label: bucketLabel(key, grain),
      values: periodValues(byKey.get(key) ?? empty(key), trend?.get(key)),
      ...(previousByKey ? { previous: previousKey ? periodValues(previousByKey.get(previousKey) ?? empty(previousKey)) : null } : {}),
    }
  })
  return { ok: true, data: { grain, rows } }
}

async function paymentsSection(windows: Windows, client: ReportRpcClient) {
  const [current, previous] = await both(windows, (window) => readPayments(client, window))
  if (!current.ok) return current
  const collected = current.data.reduce((sum, bucket) => sum + bucket.cents, 0)
  const before = okOrNull(previous)
  const previousCollected = before?.reduce((sum, bucket) => sum + bucket.cents, 0) ?? 0
  const previousByKey = before ? new Map(before.map((bucket) => [bucket.key, bucket])) : null
  const rows = current.data.map((bucket): ReportRow => {
    const was = previousByKey?.get(bucket.key)
    return {
      key: bucket.key,
      label: bucket.label,
      values: paymentValues(bucket, collected),
      ...(previousByKey ? { previous: was ? paymentValues(was, previousCollected) : null } : {}),
    }
  })
  return { ok: true as const, data: { rows } }
}

async function hoursSection(windows: Windows, client: ReportRpcClient): Promise<ReportResult<HoursSection>> {
  const current = await readHours(client, windows.current)
  if (!current.ok) return current
  return {
    ok: true,
    data: { cells: current.data.map((cell) => ({ weekday: cell.weekday, hour: cell.hour, values: { orders: cell.orders, net_sales: cell.netCents } })) },
  }
}

const PROFIT_REFUSED: ReportResult<never> = { ok: false, error: { kind: 'forbidden', message: PROFIT_FORBIDDEN_MESSAGE } }

/** Reads every requested section at once; the summary picks up "items sold" from the item (or category) rows when those were asked for too. */
export async function runReportQuery({ context, client: rawClient, sections, grain, canSeeCosts = false }: RunReportQueryInput): Promise<ReportSections> {
  const client = limitReportCalls(rawClient, MAX_CONCURRENT_REPORT_CALLS)
  const windows: Windows = context.windows
  const days = dayCount(context.period.from, context.period.to)
  const asked = new Set(sections)
  const want = <T>(section: ReportSection, run: () => Promise<T>): Promise<T | undefined> =>
    asked.has(section) ? run() : Promise.resolve(undefined)

  const [totals, items, categories, periods, payments, channels, orderTypes, branches, hours, profit] = await Promise.all([
    want('summary', () => both(windows, (window) => readTotals(client, window))),
    want('items', () => readBreakdown(windows, (window) => readItems(client, window))),
    want('categories', () => readBreakdown(windows, (window) => readCategories(client, window))),
    want('periods', () => periodsSection(windows, context, client, effectiveGrain(context, grain, days), canSeeCosts && asked.has('profit'))),
    want('payments', () => paymentsSection(windows, client)),
    want('channels', () => dimensionSection(windows, client, 'source', channelMapping)),
    want('order_types', () => dimensionSection(windows, client, 'order_type', orderTypeMapping)),
    want('branches', () => dimensionSection(windows, client, 'outlet', outletMapping(context.outletNames))),
    want('hours', () => hoursSection(windows, client)),
    want('profit', () => (canSeeCosts ? profitSection(windows, client) : Promise.resolve(PROFIT_REFUSED))),
  ])
  const itemsSold = items?.sold ?? categories?.sold ?? null
  const summary = totals ? buildSummary(totals, days, itemsSold) : undefined

  return Object.fromEntries(
    Object.entries({
      summary,
      periods,
      items: items?.section,
      categories: categories?.section,
      payments,
      channels,
      order_types: orderTypes,
      branches,
      hours,
      profit,
    }).filter(
      ([, value]) => value !== undefined,
    ),
  ) as ReportSections
}

export type { ReportFailure }
