/**
 * Guardrail: every money-bearing checkout surface must read its grand total
 * from `computeOrderTotals` (via `useCheckout`'s derived `grandTotal`) rather
 * than re-adding the parts itself.
 *
 * This is the failure mode the voucher work has to prevent. A design that
 * hand-rolls `total + deliveryFee + serviceCharge` keeps compiling and keeps
 * looking right — it just silently omits the discount, so the customer is
 * shown, and charged, full price on one checkout template out of five.
 *
 * It also pins a divergence that already exists today: `PaymentDetailsDialog`
 * added `deliveryFee || 0` with no address-match guard, while the summary right
 * above it renders "—" for the same stale quote. Two numbers, one order.
 */
import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import { computeOrderTotals } from '@/lib/order-totals'

const CHECKOUT_TEMPLATE_DIR = join(process.cwd(), 'src/components/customer/checkout-templates')

/** Every file that renders a customer-facing total. */
const MONEY_BEARING_FILES = [
  'checkout-primitives.tsx',
  'checkout-shared.tsx',
  'classic-checkout.tsx',
  'modern-checkout.tsx',
  'minimal-checkout.tsx',
  'wizard-checkout.tsx',
  'express-checkout.tsx',
] as const

/**
 * Matches an inline grand-total: a `total` term added to a delivery fee or a
 * service charge in the same expression. Deliberately loose — a false positive
 * here costs one refactor, a false negative costs a customer the wrong bill.
 */
const INLINE_TOTAL = /total\s*\+[^\n]*\b(deliveryFee|serviceChargeAmount)\b/

function readTemplate(file: string): string {
  return readFileSync(join(CHECKOUT_TEMPLATE_DIR, file), 'utf8')
}

describe('order totals wiring', () => {
  it.each(MONEY_BEARING_FILES)('%s does not recompute the grand total inline', (file) => {
    const source = readTemplate(file)

    const offendingLines = source
      .split('\n')
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => INLINE_TOTAL.test(line))

    expect(offendingLines).toEqual([])
  })

  it('useCheckout derives grandTotal through computeOrderTotals', () => {
    const source = readFileSync(join(process.cwd(), 'src/hooks/useCheckout.ts'), 'utf8')

    expect(source).toContain('computeOrderTotals')
  })

  it('the confirmation screen reads its total off the completed order snapshot helper', () => {
    // The confirmation renders AFTER checkout state is cleared, so it cannot
    // call the hook — it must still route through the shared arithmetic.
    const source = readTemplate('checkout-shared.tsx')

    expect(source).toContain('computeOrderTotals')
  })
})

describe('the divergence this refactor closes', () => {
  it('a stale delivery quote is excluded from the total, matching what the summary shows', () => {
    // Summary renders "—" for a fee quoted against a different address; the
    // total must agree and exclude it.
    const staleQuoteExcluded = computeOrderTotals({
      subtotal: 500,
      deliveryFee: null,
      serviceCharge: 25,
    })

    expect(staleQuoteExcluded.grandTotal).toBe(525)
  })
})
