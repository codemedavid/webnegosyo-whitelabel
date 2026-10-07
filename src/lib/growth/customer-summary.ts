/**
 * Customers counted as PEOPLE, for the dashboard's headline: how many new
 * customers the store got, how many came back, and what each group spent.
 *
 * A customer is a phone number. Over a period [start, end):
 *
 *   New        their first-ever completed order falls inside the period
 *   Returning  they had ordered before the period started
 *   Walk-in    an order with no phone number — counted as orders, never people
 *
 * Unlike the per-sale buckets in `classify-sale.ts`, a person keeps one label
 * for the whole period, so "38 new customers spent ₱12,400" holds even when a
 * first-timer ordered twice. New + returning + walk-in sales always equal total
 * sales.
 *
 * Pure. Only completed sales count (see `sale-record.ts`).
 */

import { isCompletedSale, type SaleRecord } from '@/lib/dashboard/sale-record'
import { bucketLabels, elapsedBuckets, type DashboardWindow } from '@/lib/dashboard/periods'
import type { VisitIndex } from './classify-sale'

export interface CustomerPeriod {
  orders: number
  sales: number
  newCustomers: number
  returningCustomers: number
  /** Returning customers who held a stamp card by the period's end (new customers are never counted). */
  returningMembers: number
  newCustomerSales: number
  returningCustomerSales: number
  walkInOrders: number
  walkInSales: number
}

/** People per hour or day. "New" sums to the period's new customers; future buckets are null. */
export interface CustomerTrendRow {
  label: string
  new: number | null
  returning: number | null
}

/** The comparison window's people per bucket, aligned with `trend` for a dashed "before" line. */
export interface CustomerCounts {
  new: number
  returning: number
}

export interface CustomerSummary {
  current: CustomerPeriod
  previous: CustomerPeriod
  trend: CustomerTrendRow[]
  previousTrend: CustomerCounts[]
}

export interface CustomerSummaryInput {
  sales: readonly SaleRecord[]
  visits: VisitIndex
  /** Earliest stamp-card creation per phone, epoch ms. */
  cardsSince: Readonly<Record<string, number>>
  window: DashboardWindow
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** The first completed order this phone ever placed here; the sale itself when history is missing. */
function firstVisitOf(visits: VisitIndex, phone: string, fallback: number): number {
  const first = visits.visitsOf(phone)[0]
  return first === undefined ? fallback : Math.min(first, fallback)
}

function summarizePeriod(
  sales: readonly SaleRecord[],
  start: number,
  end: number,
  input: CustomerSummaryInput,
): CustomerPeriod {
  const inPeriod = sales.filter((sale) => sale.at >= start && sale.at < end)
  const spendByPhone = new Map<string, { spent: number; firstSeen: number }>()
  let walkInOrders = 0
  let walkInSales = 0

  for (const sale of inPeriod) {
    if (!sale.phone) {
      walkInOrders += 1
      walkInSales += sale.total
      continue
    }
    const entry = spendByPhone.get(sale.phone)
    spendByPhone.set(sale.phone, {
      spent: (entry?.spent ?? 0) + sale.total,
      firstSeen: Math.min(entry?.firstSeen ?? sale.at, sale.at),
    })
  }

  let newCustomers = 0
  let newCustomerSales = 0
  let returningCustomerSales = 0
  let returningMembers = 0
  for (const [phone, entry] of spendByPhone) {
    const isNew = firstVisitOf(input.visits, phone, entry.firstSeen) >= start
    if (isNew) {
      newCustomers += 1
      newCustomerSales += entry.spent
      continue
    }
    returningCustomerSales += entry.spent
    const cardSince = input.cardsSince[phone]
    if (cardSince !== undefined && cardSince < end) returningMembers += 1
  }

  return {
    orders: inPeriod.length,
    sales: round2(inPeriod.reduce((total, sale) => total + sale.total, 0)),
    newCustomers,
    returningCustomers: spendByPhone.size - newCustomers,
    returningMembers,
    newCustomerSales: round2(newCustomerSales),
    returningCustomerSales: round2(returningCustomerSales),
    walkInOrders,
    walkInSales: round2(walkInSales),
  }
}

/** People in [bucketStart, bucketEnd): new when their first-ever visit is inside the bucket. */
function countBucket(
  sales: readonly SaleRecord[],
  bucketStart: number,
  bucketEnd: number,
  input: CustomerSummaryInput,
): CustomerCounts {
  const phones = new Map<string, number>()
  for (const sale of sales) {
    if (!sale.phone || sale.at < bucketStart || sale.at >= bucketEnd) continue
    phones.set(sale.phone, Math.min(phones.get(sale.phone) ?? sale.at, sale.at))
  }
  let fresh = 0
  for (const [phone, firstSeen] of phones) {
    if (firstVisitOf(input.visits, phone, firstSeen) >= bucketStart) fresh += 1
  }
  return { new: fresh, returning: phones.size - fresh }
}

function buildTrend(sales: readonly SaleRecord[], input: CustomerSummaryInput): CustomerTrendRow[] {
  const { window } = input
  const elapsed = elapsedBuckets(window)
  return bucketLabels(window).map((label, i) => {
    if (i >= elapsed) return { label, new: null, returning: null }
    const bucketStart = window.start + i * window.bucketMs
    return { label, ...countBucket(sales, bucketStart, bucketStart + window.bucketMs, input) }
  })
}

function buildPreviousTrend(sales: readonly SaleRecord[], input: CustomerSummaryInput): CustomerCounts[] {
  const { window } = input
  return Array.from({ length: window.bucketCount }, (_, i) => {
    const bucketStart = window.previousStart + i * window.bucketMs
    // The comparison window is cut at the same clock time as the current one.
    const bucketEnd = Math.min(bucketStart + window.bucketMs, window.previousEnd)
    return bucketStart < bucketEnd ? countBucket(sales, bucketStart, bucketEnd, input) : { new: 0, returning: 0 }
  })
}

export function buildCustomerSummary(input: CustomerSummaryInput): CustomerSummary {
  const { window } = input
  const completed = input.sales.filter(isCompletedSale)
  return {
    current: summarizePeriod(completed, window.start, window.end, input),
    previous: summarizePeriod(completed, window.previousStart, window.previousEnd, input),
    trend: buildTrend(completed, input),
    previousTrend: buildPreviousTrend(completed, input),
  }
}
