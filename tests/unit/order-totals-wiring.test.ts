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

const CHECKOUT_TEMPLATE_DIR = 'src/components/customer/checkout-templates'

/**
 * Every file that renders or reports a customer-facing total.
 *
 * `src/app/actions/orders.ts` is on this list because the server is the last
 * place a total is stated: it composes the merchant's order-notification email.
 * It was missed on the first pass — the list only covered the five checkout
 * templates — and it was quoting its own inline sum, so a discounted order
 * would have shown the customer the discounted price and emailed the merchant
 * the full one.
 */
const MONEY_BEARING_FILES = [
  `${CHECKOUT_TEMPLATE_DIR}/checkout-primitives.tsx`,
  `${CHECKOUT_TEMPLATE_DIR}/checkout-shared.tsx`,
  `${CHECKOUT_TEMPLATE_DIR}/classic-checkout.tsx`,
  `${CHECKOUT_TEMPLATE_DIR}/modern-checkout.tsx`,
  `${CHECKOUT_TEMPLATE_DIR}/minimal-checkout.tsx`,
  `${CHECKOUT_TEMPLATE_DIR}/wizard-checkout.tsx`,
  `${CHECKOUT_TEMPLATE_DIR}/express-checkout.tsx`,
  'src/app/actions/orders.ts',
] as const

/**
 * Matches an inline grand-total: a `total` term added to a delivery fee or a
 * service charge in the same expression. Deliberately loose — a false positive
 * here costs one refactor, a false negative costs a customer the wrong bill.
 */
const INLINE_TOTAL = /total\s*\+[^\n]*\b(deliveryFee|serviceChargeAmount)\b/

/**
 * The same offence written from the other end: a delivery-fee term added to a
 * service-charge term. `orders.ts` summed its own line subtotals first, so the
 * `total +` shape above never matched it.
 */
const INLINE_PARTS_SUM = /\b\w*[Dd]eliveryFee\b[^\n]*\+[^\n]*\b\w*[Ss]erviceCharge\w*\b/

function readSource(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8')
}

function readTemplate(file: string): string {
  return readSource(`${CHECKOUT_TEMPLATE_DIR}/${file}`)
}

describe('order totals wiring', () => {
  it.each(MONEY_BEARING_FILES)('%s does not recompute the grand total inline', (file) => {
    const source = readSource(file)

    const offendingLines = source
      .split('\n')
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => INLINE_TOTAL.test(line) || INLINE_PARTS_SUM.test(line))

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
