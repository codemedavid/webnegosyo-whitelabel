/**
 * A long report is read one business month at a time and merged
 * (`read/report-chunks.ts`, `read/merge-report-rows.ts`). These properties pin
 * the promise that makes that safe: reading the orders in two time-ordered
 * parts and merging gives EXACTLY what reading them at once gives.
 */
import fc from 'fast-check'
import { bucketPayments } from '@/lib/reports/payment-buckets'
import { rollupCategories, rollupHours, rollupItems, rollupPeriods } from '@/lib/reports/sales-breakdowns'
import { summarizeSales, type SalesSummary } from '@/lib/reports/sales-model'
import type { SalesTotals } from '@/lib/reports/read/report-rpc-rows'
import {
  mergeBreakdownRows,
  mergeHourCells,
  mergePaymentBuckets,
  mergePeriodRows,
  mergeSalesTotals,
} from '@/lib/reports/read/merge-report-rows'
import type { ReportOrder } from '@/lib/reports/sales-model'
import { reportOrdersArb } from '../../../fixtures/report-orders'
import { propertyParameters } from '../../../utils/property'

function totals(orders: readonly ReportOrder[]): SalesTotals {
  const { discountByKind: _ignored, ...rest }: SalesSummary = summarizeSales(orders)
  return rest
}

/** Orders sorted by time and cut at a point: every order before it in part one. */
const splitOrdersArb = reportOrdersArb({ maxLength: 30 }).chain((orders) =>
  fc.nat({ max: orders.length }).map((cut) => {
    const sorted = [...orders].sort((a, b) => a.at - b.at)
    // Never split two orders that share an instant: chunks are half-open in time.
    let index = cut
    while (index > 0 && index < sorted.length && sorted[index].at === sorted[index - 1].at) index += 1
    return { all: sorted, parts: [sorted.slice(0, index), sorted.slice(index)] }
  }),
)

describe('merging month chunks equals reading the whole window (property)', () => {
  test('sales totals', () => {
    fc.assert(
      fc.property(splitOrdersArb, ({ all, parts }) => {
        expect(mergeSalesTotals(parts.map(totals))).toEqual(totals(all))
      }),
      propertyParameters(),
    )
  })

  test('periods by day and by month', () => {
    fc.assert(
      fc.property(splitOrdersArb, ({ all, parts }) => {
        expect(mergePeriodRows(parts.map((part) => rollupPeriods(part, 'day')))).toEqual(rollupPeriods(all, 'day'))
        expect(mergePeriodRows(parts.map((part) => rollupPeriods(part, 'month')))).toEqual(rollupPeriods(all, 'month'))
      }),
      propertyParameters(),
    )
  })

  test('items and categories, labels from the newest part', () => {
    fc.assert(
      fc.property(splitOrdersArb, ({ all, parts }) => {
        expect(mergeBreakdownRows(parts.map(rollupItems))).toEqual(rollupItems(all))
        expect(mergeBreakdownRows(parts.map(rollupCategories))).toEqual(rollupCategories(all))
      }),
      propertyParameters(),
    )
  })

  test('weekday × hour cells', () => {
    fc.assert(
      fc.property(splitOrdersArb, ({ all, parts }) => {
        expect(mergeHourCells(parts.map((part) => rollupHours(part)))).toEqual(rollupHours(all))
      }),
      propertyParameters(),
    )
  })

  // Only the TOTAL is exact. Which row a peso lands in can differ at the
  // edges: the engine names and joins methods ("Cash" typed by name → the Cash
  // method's id; a method renamed mid-window) from the whole window's ledger
  // parts, which a month's buckets no longer carry. Ordinary windows (one name
  // per method) still match row for row — see the example test.
  test('payments: the total collected is exact', () => {
    fc.assert(
      fc.property(splitOrdersArb, ({ all, parts }) => {
        const merged = mergePaymentBuckets(parts.map((part) => bucketPayments(part).buckets))
        const whole = bucketPayments(all)
        const sum = (rows: readonly { cents: number }[]) => rows.reduce((total, row) => total + row.cents, 0)
        expect(sum(merged)).toBe(sum(whole.buckets))
      }),
      propertyParameters(),
    )
  })
})
