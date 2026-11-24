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
 * first-timer ordered twice.
 *
 * Pure. People are counted from completed sales only (see `sale-record.ts`),
 * the same rule as the app's customer split; each sale is worth its net sales
 * when the reader knows it (platform), else its bill (`saleAmount`).
 *
 * Money always adds up to the dashboard's sales figure. On `net_sales` (the
 * reports' rule: every live order counts) the live orders that are not
 * completed yet — not paid, or not handed over — are their own "open" group,
 * so new + returning + walk-in + open = Net sales, the number the Net sales
 * tile and /admin/reports print (Koko Coffee, 2026-11-24). On
 * `completed_totals` there is no open group and the three add up to Sales.
 */

import { countsTowardSales, isCompletedSale, saleAmount, type SaleRecord, type SalesBasis } from '@/lib/dashboard/sale-record'
import { bucketLabels, elapsedBuckets, type DashboardWindow } from '@/lib/dashboard/periods'
import type { VisitIndex } from './classify-sale'

export interface CustomerPeriod {
  /** Every order counted in `sales` (completed + open). */
  orders: number
  /** The dashboard's sales figure: Net sales on `net_sales`, else completed bills. */
  sales: number
  newCustomers: number
  returningCustomers: number
  /** Returning customers who held a stamp card by the period's end (new customers are never counted). */
  returningMembers: number
  newCustomerSales: number
  returningCustomerSales: number
  walkInOrders: number
  walkInSales: number
  /** Live orders not completed yet (unpaid / not handed over); always 0 on `completed_totals`. */
  openOrders: number
  openSales: number
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
  /** What the dashboard's sales are made of (`sale-record.ts`). Absent = 'completed_totals'. */
  basis?: SalesBasis
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
  open: readonly SaleRecord[],
  start: number,
  end: number,
  input: CustomerSummaryInput,
): CustomerPeriod {
  const inPeriod = sales.filter((sale) => sale.at >= start && sale.at < end)
  const openInPeriod = open.filter((sale) => sale.at >= start && sale.at < end)
  const spendByPhone = new Map<string, { spent: number; firstSeen: number }>()
  let walkInOrders = 0
  let walkInSales = 0

  for (const sale of inPeriod) {
    if (!sale.phone) {
      walkInOrders += 1
      walkInSales += saleAmount(sale)
      continue
    }
    const entry = spendByPhone.get(sale.phone)
    spendByPhone.set(sale.phone, {
      spent: (entry?.spent ?? 0) + saleAmount(sale),
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

  const openSales = openInPeriod.reduce((total, sale) => total + saleAmount(sale), 0)
  return {
    orders: inPeriod.length + openInPeriod.length,
    sales: round2(inPeriod.reduce((total, sale) => total + saleAmount(sale), 0) + openSales),
    newCustomers,
    returningCustomers: spendByPhone.size - newCustomers,
    returningMembers,
    newCustomerSales: round2(newCustomerSales),
    returningCustomerSales: round2(returningCustomerSales),
    walkInOrders,
    walkInSales: round2(walkInSales),
    openOrders: openInPeriod.length,
    openSales: round2(openSales),
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
  const basis = input.basis ?? 'completed_totals'
  const open =
    basis === 'net_sales' ? input.sales.filter((sale) => countsTowardSales(sale, basis) && !isCompletedSale(sale)) : []
  return {
    current: summarizePeriod(completed, open, window.start, window.end, input),
    previous: summarizePeriod(completed, open, window.previousStart, window.previousEnd, input),
    trend: buildTrend(completed, input),
    previousTrend: buildPreviousTrend(completed, input),
  }
}
