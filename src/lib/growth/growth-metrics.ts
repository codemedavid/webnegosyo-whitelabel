/**
 * The Growth tab: who bought, which customer type moved the period, how many
 * sales left without a phone, and who is worth bringing back.
 *
 * Pure. Buckets come from `classify-sale.ts`; only completed sales count.
 */

import {
  SALE_CHANNEL_LABELS,
  isCompletedSale,
  type SaleChannel,
  type SaleRecord,
} from '@/lib/dashboard/sale-record'
import {
  DAY_MS,
  bucketIndex,
  bucketLabels,
  compareLabelFor,
  elapsedBuckets,
  isInCurrent,
  isInPrevious,
  type DashboardWindow,
} from '@/lib/dashboard/periods'
import { percentChange } from '@/lib/dashboard/overview'
import {
  GROWTH_BUCKETS,
  GROWTH_BUCKET_LABELS,
  classifySale,
  type GrowthBucket,
  type VisitIndex,
} from './classify-sale'

/** The guest-to-member path always looks back this far, whatever the range. */
export const PATH_WINDOW_DAYS = 30
/** "First-timers not back" — a single visit at least this long ago… */
export const NOT_BACK_AFTER_DAYS = 14
/** …and no longer ago than this (older ones are a different conversation). */
export const NOT_BACK_WITHIN_DAYS = 60
/** Same-weekday history the "usual day" baseline averages over. */
export const USUAL_DAY_WEEKS = 4

export interface BucketSlice {
  bucket: GrowthBucket
  label: string
  sales: number
  orders: number
  /** Share of all sales, 0–100. */
  share: number
  previousSales: number
  change: number | null
}

export type GrowthTrendRow = { label: string } & Record<GrowthBucket, number | null>

export interface GrowthDriver {
  bucket: GrowthBucket
  label: string
  /** Signed ₱ difference against the baseline. */
  difference: number
  /** e.g. "a usual Saturday", "the previous 7 days". */
  baselineLabel: string
}

export interface CaptureChannelRow {
  channel: SaleChannel
  label: string
  orders: number
  identifiedOrders: number
  rate: number
}

export interface CaptureScore {
  /** Share of completed orders that carried a phone, 0–100. */
  rate: number
  /** Null when the comparison window had no completed orders. */
  previousRate: number | null
  guestOrders: number
  guestSales: number
  byChannel: CaptureChannelRow[]
}

export interface GuestToMemberPath {
  guestOrders: number
  firstTimers: number
  cameBack: number
  members: number
}

export interface DashboardGrowth {
  totalSales: number
  previousTotalSales: number
  mix: BucketSlice[]
  /** (Regulars + Members) ÷ all sales, 0–100 — the plan's north star. Previous is null without earlier sales. */
  repeatShare: { current: number; previous: number | null }
  trend: GrowthTrendRow[]
  driver: GrowthDriver | null
  /** False when there was no earlier trading to compare with (new store, first day). */
  hasBaseline: boolean
  capture: CaptureScore
  path: GuestToMemberPath
  wonBackCustomers: number
  actions: { firstTimersNotBack: number; slippingAway: number }
}

export interface GrowthInput {
  sales: readonly SaleRecord[]
  visits: VisitIndex
  /** Earliest stamp-card creation per phone, epoch ms. */
  cardsSince: Readonly<Record<string, number>>
  window: DashboardWindow
}

interface ClassifiedSale {
  sale: SaleRecord
  bucket: GrowthBucket
  wonBack: boolean
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0
}

function sumSales(sales: readonly ClassifiedSale[], bucket?: GrowthBucket): number {
  return round2(
    sales.reduce((total, entry) => (!bucket || entry.bucket === bucket ? total + entry.sale.total : total), 0),
  )
}

function classifyAll(input: GrowthInput): ClassifiedSale[] {
  return input.sales.filter(isCompletedSale).map((sale) => {
    const previous = sale.phone ? input.visits.previousVisit(sale.phone, sale.at) : null
    const card = sale.phone ? input.cardsSince[sale.phone] ?? null : null
    return { sale, ...classifySale(sale, previous, card) }
  })
}

function buildMix(current: ClassifiedSale[], previous: ClassifiedSale[]): BucketSlice[] {
  const total = sumSales(current)
  return GROWTH_BUCKETS.map((bucket) => {
    const sales = sumSales(current, bucket)
    const previousSales = sumSales(previous, bucket)
    return {
      bucket,
      label: GROWTH_BUCKET_LABELS[bucket],
      sales,
      orders: current.filter((entry) => entry.bucket === bucket).length,
      share: pct(sales, total),
      previousSales,
      change: percentChange(sales, previousSales),
    }
  })
}

function repeatShare(sales: ClassifiedSale[]): number {
  const repeat = sales.filter((entry) => entry.bucket === 'returning' || entry.bucket === 'member')
  return pct(sumSales(repeat), sumSales(sales))
}

function buildTrend(window: DashboardWindow, current: ClassifiedSale[]): GrowthTrendRow[] {
  const elapsed = elapsedBuckets(window)
  const rows: GrowthTrendRow[] = bucketLabels(window).map((label, i) => ({
    label,
    guest: i < elapsed ? 0 : null,
    new: i < elapsed ? 0 : null,
    returning: i < elapsed ? 0 : null,
    member: i < elapsed ? 0 : null,
  }))
  for (const entry of current) {
    const index = bucketIndex(window, window.start, entry.sale.at)
    if (index === null) continue
    const row = rows[index]
    rows[index] = { ...row, [entry.bucket]: round2((row[entry.bucket] ?? 0) + entry.sale.total) }
  }
  return rows
}

const WEEKDAY = new Intl.DateTimeFormat('en-PH', { weekday: 'long', timeZone: 'Asia/Manila' })

/**
 * Baseline per bucket. "Today" is compared with the average of the same weekday
 * over the last {@link USUAL_DAY_WEEKS} weeks, each cut at the same clock time
 * — a usual Saturday, not yesterday. Longer ranges use the previous window.
 */
function baseline(
  window: DashboardWindow,
  all: ClassifiedSale[],
  previous: ClassifiedSale[],
): { totals: Record<GrowthBucket, number>; label: string } {
  const totals = { guest: 0, new: 0, returning: 0, member: 0 }
  if (window.range !== 'today') {
    for (const bucket of GROWTH_BUCKETS) totals[bucket] = sumSales(previous, bucket)
    return { totals, label: `the ${compareLabelFor(window.range)}` }
  }
  for (let week = 1; week <= USUAL_DAY_WEEKS; week += 1) {
    const start = window.start - week * 7 * DAY_MS
    const end = window.end - week * 7 * DAY_MS
    for (const entry of all) {
      if (entry.sale.at >= start && entry.sale.at < end) totals[entry.bucket] += entry.sale.total / USUAL_DAY_WEEKS
    }
  }
  return { totals, label: `a usual ${WEEKDAY.format(new Date(window.start))}` }
}

function findDriver(
  window: DashboardWindow,
  all: ClassifiedSale[],
  current: ClassifiedSale[],
  previous: ClassifiedSale[],
): { driver: GrowthDriver | null; hasBaseline: boolean } {
  const base = baseline(window, all, previous)
  // No baseline (a new store, or a first trading day) means nothing to explain.
  if (GROWTH_BUCKETS.every((bucket) => base.totals[bucket] === 0)) return { driver: null, hasBaseline: false }
  let best: GrowthDriver | null = null
  for (const bucket of GROWTH_BUCKETS) {
    const difference = round2(sumSales(current, bucket) - base.totals[bucket])
    if (Math.abs(difference) < 1) continue
    if (!best || Math.abs(difference) > Math.abs(best.difference)) {
      best = { bucket, label: GROWTH_BUCKET_LABELS[bucket], difference, baselineLabel: base.label }
    }
  }
  return { driver: best, hasBaseline: true }
}

function buildCapture(current: ClassifiedSale[], previous: ClassifiedSale[]): CaptureScore {
  const identified = (list: ClassifiedSale[]) => list.filter((entry) => entry.bucket !== 'guest').length
  const guests = current.filter((entry) => entry.bucket === 'guest')
  const channels = new Map<SaleChannel, { orders: number; identified: number }>()
  for (const entry of current) {
    const row = channels.get(entry.sale.channel) ?? { orders: 0, identified: 0 }
    channels.set(entry.sale.channel, {
      orders: row.orders + 1,
      identified: row.identified + Number(entry.bucket !== 'guest'),
    })
  }
  return {
    rate: pct(identified(current), current.length),
    previousRate: previous.length > 0 ? pct(identified(previous), previous.length) : null,
    guestOrders: guests.length,
    guestSales: sumSales(guests),
    byChannel: [...channels.entries()]
      .map(([channel, row]) => ({
        channel,
        label: SALE_CHANNEL_LABELS[channel],
        orders: row.orders,
        identifiedOrders: row.identified,
        rate: pct(row.identified, row.orders),
      }))
      .sort((a, b) => b.orders - a.orders),
  }
}

function buildPath(input: GrowthInput, all: ClassifiedSale[], now: number): GuestToMemberPath {
  const since = now - PATH_WINDOW_DAYS * DAY_MS
  const guestOrders = all.filter((entry) => entry.bucket === 'guest' && entry.sale.at >= since).length
  let firstTimers = 0
  let cameBack = 0
  let members = 0
  for (const phone of input.visits.phones()) {
    const visits = input.visits.visitsOf(phone)
    if (visits.length === 0 || visits[0] < since) continue
    firstTimers += 1
    if (visits.length >= 2) cameBack += 1
    if (input.cardsSince[phone] !== undefined) members += 1
  }
  return { guestOrders, firstTimers, cameBack, members }
}

function buildActions(visits: VisitIndex, now: number): DashboardGrowth['actions'] {
  let firstTimersNotBack = 0
  let slippingAway = 0
  for (const phone of visits.phones()) {
    const list = visits.visitsOf(phone)
    const last = list[list.length - 1]
    const silence = now - last
    if (list.length === 1) {
      if (silence >= NOT_BACK_AFTER_DAYS * DAY_MS && silence <= NOT_BACK_WITHIN_DAYS * DAY_MS) firstTimersNotBack += 1
      continue
    }
    // Same cadence rule as the Customer Hub's "at risk": quiet for more than
    // 1.5× their usual gap, but not yet 3× (past that they have lapsed).
    const cadence = (last - list[0]) / (list.length - 1)
    if (cadence > 0 && silence > cadence * 1.5 && silence <= cadence * 3) slippingAway += 1
  }
  return { firstTimersNotBack, slippingAway }
}

export function buildGrowth(input: GrowthInput): DashboardGrowth {
  const { window } = input
  const all = classifyAll(input)
  const current = all.filter((entry) => isInCurrent(window, entry.sale.at))
  const previous = all.filter((entry) => isInPrevious(window, entry.sale.at))
  const wonBack = new Set(current.flatMap((entry) => (entry.wonBack && entry.sale.phone ? [entry.sale.phone] : [])))

  return {
    totalSales: sumSales(current),
    previousTotalSales: sumSales(previous),
    mix: buildMix(current, previous),
    repeatShare: { current: repeatShare(current), previous: previous.length > 0 ? repeatShare(previous) : null },
    trend: buildTrend(window, current),
    ...findDriver(window, all, current, previous),
    capture: buildCapture(current, previous),
    path: buildPath(input, all, window.end),
    wonBackCustomers: wonBack.size,
    actions: buildActions(input.visits, window.end),
  }
}
