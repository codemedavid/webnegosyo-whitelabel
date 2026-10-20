/**
 * Plan §10.1 reconciliation invariants, as fast-check properties over the
 * shared report-order generator (`tests/fixtures/report-orders.ts`). Every
 * figure is in centavos. 200 runs on every change, 5000 nightly
 * (FC_NUM_RUNS); a failure prints a seed and path that replay it, shrunk
 * (FC_SEED / FC_PATH, see tests/utils/property.ts).
 */
import fc from 'fast-check'
import { bucketPayments } from '@/lib/reports/payment-buckets'
import { orderFigures, rollupLines, rollupOrders, summarizeSales } from '@/lib/reports/sales-model'
import { reportOrdersArb } from '../../fixtures/report-orders'
import { propertyParameters } from '../../utils/property'

const sumNet = (rows: Map<string, { netCents: number }>) => [...rows.values()].reduce((s, r) => s + r.netCents, 0)

describe('sales invariants (property)', () => {
  test('1–2. gross − discounts = net; net + service + delivery = Σ live order totals', () => {
    fc.assert(
      fc.property(reportOrdersArb(), (orders) => {
        const summary = summarizeSales(orders)
        const billed = orders
          .filter((o) => orderFigures(o).isLive)
          .reduce((sum, o) => sum + Math.round(Number(o.total) * 100), 0)

        // Ledger refunds settle edits; they are not a second cut to sales.
        expect(summary.grossCents - summary.discountCents).toBe(summary.netCents)
        expect(summary.netCents + summary.serviceCents + summary.deliveryCents).toBe(billed)
        expect(summary.billedCents).toBe(billed)
        // Discounts by kind add up to the discounts (food + delivery).
        expect(Object.values(summary.discountByKind).reduce((a, b) => a + b, 0)).toBe(
          summary.discountCents + summary.deliveryDiscountCents,
        )
      }),
      propertyParameters(),
    )
  })

  test('3. Σ items = Σ categories = Σ channels = Σ branches (Unassigned included) = net', () => {
    fc.assert(
      fc.property(reportOrdersArb(), (orders) => {
        const { netCents } = summarizeSales(orders)

        expect(sumNet(rollupLines(orders, (l) => l.menuItemId ?? '∅'))).toBe(netCents)
        expect(sumNet(rollupLines(orders, (l) => l.categoryName ?? '∅'))).toBe(netCents)
        expect(sumNet(rollupOrders(orders, (o) => o.channel))).toBe(netCents)
        expect(sumNet(rollupOrders(orders, (o) => o.outletId ?? 'unassigned'))).toBe(netCents)
      }),
      propertyParameters(),
    )
  })

  test('4. Σ payment types = collected; collected − overpaid + unpaid = billed', () => {
    fc.assert(
      fc.property(reportOrdersArb(), (orders) => {
        const summary = summarizeSales(orders)
        const payments = bucketPayments(orders)

        expect(payments.buckets.reduce((s, b) => s + b.cents, 0)).toBe(payments.collectedCents)
        expect(payments.collectedCents).toBe(summary.collectedCents)
        expect(summary.collectedCents - summary.overpaidCents + summary.unpaidCents).toBe(summary.billedCents)
        expect(payments.unpaidCents).toBe(summary.unpaidCents)
        expect(summary.unpaidCents).toBeGreaterThanOrEqual(0)
        expect(summary.overpaidCents).toBeGreaterThanOrEqual(0)
      }),
      propertyParameters(),
    )
  })

  test('6. each order counts once: any split of the list adds back to the whole', () => {
    fc.assert(
      fc.property(reportOrdersArb(), fc.nat(), (orders, cut) => {
        const at = cut % (orders.length + 1)
        const whole = summarizeSales(orders)
        const parts = [summarizeSales(orders.slice(0, at)), summarizeSales(orders.slice(at))]

        expect(parts[0].netCents + parts[1].netCents).toBe(whole.netCents)
        expect(parts[0].billedCents + parts[1].billedCents).toBe(whole.billedCents)
        expect(parts[0].collectedCents + parts[1].collectedCents).toBe(whole.collectedCents)
        expect(parts[0].orders + parts[1].orders).toBe(whole.orders)
      }),
      propertyParameters(),
    )
  })
})
