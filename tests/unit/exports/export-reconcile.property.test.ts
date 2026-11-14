/**
 * The export proves itself (plan 2026-11-14 §4): whatever orders a store has,
 * the Sales column of the Orders sheet, of the Order lines sheet and of the
 * Customers sheet each add up to the engine's net sales, to the centavo — and
 * the Summary sheet's own Checks block says "Matches". Reads go through a
 * client that hands back a few rows per response, so a reader that stops at
 * the first page fails here.
 */
import fc from 'fast-check'
import { bucketPayments } from '@/lib/reports/payment-buckets'
import { ledgerTotals, summarizeSales } from '@/lib/reports/sales-model'
import { toCents } from '@/lib/reports/money'
import { runExport } from '@/lib/exports/run-export'
import { summaryRows } from '@/lib/exports/sheets/summary-sheets'
import type { BuiltSheet } from '@/lib/exports/types'
import { propertyParameters } from '../../utils/property'
import { DAY, NOW, access, contextFor, noReports, ordersArb, sectionsFromOrders, seedStore } from './export-fixtures'

const PAGE = 7

function cents(sheet: BuiltSheet, columnId: string): number {
  const index = sheet.columns.findIndex((column) => column.id === columnId)
  if (index < 0) throw new Error(`no column ${columnId} on ${sheet.name}`)
  return sheet.rows.reduce((sum, row) => sum + Math.round(Number(row[index] ?? 0) * 100), 0)
}

describe('row-level sheets reconcile with the one sales definition', () => {
  it('Σ Sales on Orders = Order lines = Customers = net sales; money received and the ledger agree', async () => {
    await fc.assert(
      fc.asyncProperty(ordersArb(40), async (orders) => {
        const store = seedStore(orders, {}, PAGE)
        const result = await runExport({
          context: contextFor({ period: 'custom', ...DAY }),
          storeName: 'Shop',
          access: access('reports', 'customers'),
          reportClient: noReports,
          detailClient: store.client,
          sheets: ['orders', 'order_lines', 'payments_received', 'customers'],
          now: NOW,
          pageSize: PAGE,
        })
        const [ordersSheet, lines, payments, customers] = result.sheets
        const expected = summarizeSales(orders)

        expect(ordersSheet.rows).toHaveLength(orders.length)
        expect(cents(ordersSheet, 'net')).toBe(expected.netCents)
        expect(cents(ordersSheet, 'gross')).toBe(expected.grossCents)
        expect(cents(ordersSheet, 'discounts')).toBe(expected.discountCents)
        expect(cents(ordersSheet, 'collected')).toBe(expected.collectedCents)
        expect(cents(ordersSheet, 'unpaid')).toBe(expected.unpaidCents)
        expect(cents(lines, 'net')).toBe(expected.netCents)
        expect(cents(customers, 'net')).toBe(expected.netCents)

        const ledger = orders.map((order) => ledgerTotals(order.payments))
        expect(payments.rows).toHaveLength(orders.reduce((sum, order) => sum + order.payments.length, 0))
        expect(cents(payments, 'amount')).toBe(ledger.reduce((sum, totals) => sum + totals.chargeCents - totals.refundCents, 0))
        // Every stored dish is on the lines sheet with its stored subtotal.
        expect(cents(lines, 'line_total')).toBe(orders.reduce((sum, order) => sum + order.lines.reduce((s, line) => s + toCents(line.subtotal), 0), 0))
      }),
      propertyParameters({ numRuns: 60 }),
    )
  })

  it('the Summary sheet checks itself: days, items and payment methods all add up', () => {
    fc.assert(
      fc.property(ordersArb(), (orders) => {
        const rows = summaryRows(sectionsFromOrders(orders))
        const checks = rows.filter((row) => typeof row.line === 'string' && row.line.includes('added up'))
        expect(checks).toHaveLength(3)
        for (const check of checks) expect(check.note).toBe('Matches')
        // The engine's own buckets are what the payment check adds up.
        expect(bucketPayments(orders).buckets.reduce((sum, bucket) => sum + bucket.cents, 0)).toBe(summarizeSales(orders).collectedCents)
      }),
      propertyParameters(),
    )
  })
})
