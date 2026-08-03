/**
 * Guardrail: every admin surface that states an order's total must render its
 * discount rows through `orderSummaryRows`.
 *
 * This is the order-management twin of `order-totals-wiring.test.ts`, and the
 * same failure mode. A surface that lists items and then prints
 * `order.total` keeps compiling and keeps looking right — until the order was
 * discounted, at which point the items visibly do not add up to what the
 * customer paid and nothing on the surface explains the difference. The
 * merchant is left unable to tell whether they were underpaid.
 *
 * `order-detail-dialog.tsx` had the worse version: it derived
 * `Subtotal = order.total - delivery_fee`. Since `order.total` is stored NET of
 * the discount, that row contradicted the item list directly above it.
 *
 * A list rather than a directory scan, so adding a new order surface is a
 * deliberate decision to add it here — the same discipline the checkout
 * guardrail uses.
 */
import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import { orderSummaryRows } from '@/lib/order-summary-rows'

/** Admin surfaces that state an order's total to a merchant. */
const ORDER_SURFACES = [
  'src/components/admin/order-detail-dialog.tsx',
  'src/components/admin/order-card.tsx',
  'src/components/admin/convex-order-sheet.tsx',
]

function read(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8')
}

describe('admin order surfaces show what was discounted', () => {
  it('has surfaces to check', () => {
    // Guards against the scan passing because the list emptied.
    expect(ORDER_SURFACES.length).toBeGreaterThan(0)
  })

  it.each(ORDER_SURFACES)('%s renders its money rows through orderSummaryRows', (file) => {
    expect(read(file)).toContain('orderSummaryRows')
  })

  it.each(ORDER_SURFACES)('%s reads the stored discount', (file) => {
    // Rows alone are not enough: without `readOrderDiscount` the surface would
    // render a subtotal and a total with the discount silently absent between
    // them, which reconciles to nothing.
    expect(read(file)).toContain('readOrderDiscount')
  })

  it('never derives a subtotal by subtracting delivery from the total', () => {
    // `order.total` is stored net of the discount, so this derivation produces
    // a "subtotal" that contradicts the items listed above it.
    const offenders = ORDER_SURFACES.filter((file) =>
      /Number\(order\.total\)\s*-\s*\(?\s*Number\(order\.delivery_fee\)/.test(read(file)),
    )

    expect(offenders).toEqual([])
  })

  it('agrees with the shared rules about a discounted order', () => {
    // Pins the behaviour the surfaces are wired to, so this file fails if the
    // rules themselves stop producing a discount row.
    const rows = orderSummaryRows({
      subtotal: 200,
      total: 180,
      discount: { total: 20, lines: [{ label: 'WELCOME10', amount: 20 }] },
    })

    expect(rows.map((r) => r.kind)).toEqual(['subtotal', 'discount', 'total'])
  })
})
