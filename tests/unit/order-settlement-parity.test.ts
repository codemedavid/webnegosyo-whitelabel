/**
 * The settlement breakdown a merchant reads on a placed order.
 *
 * `computeBalance` answers one number. A screen needs the account behind it:
 * what was charged, what was given back, what that nets to, and which of
 * collect / refund / settled to offer. The register has that in
 * `summarizeSettlement`; the web admin has nothing.
 *
 * This is the layer the "attach a voucher to a placed order" flow reads. After
 * a ₱40 code lands on a fully paid ₱250 order the merchant must be shown
 * "refund due ₱40" — which needs the charged and refunded halves kept apart,
 * not just the net.
 *
 * The web copy deliberately returns NUMBERS ONLY. The app's version also
 * returns a pre-formatted `balanceLabel` built from its own `formatPeso`; the
 * web formats with `formatPrice` from `@/lib/cart-utils`. Porting the label too
 * would be a second money-formatting implementation with no caller, so parity
 * below compares the numeric fields and the intent, which is all that can
 * meaningfully drift.
 *
 * Mirrors `order-balance-parity.test.ts` and `order-discount-parity.test.ts`.
 */
import { describe, it, expect } from '@jest/globals'
import { summarizeSettlement as summarizeOnWeb } from '@/lib/order-settlement'
import type { OrderPayment } from '@/lib/order-balance'
import { summarizeSettlement as summarizeOnApp } from '../../webnegosyo-app/lib/order-history-view'

const charge = (amount: number): OrderPayment => ({ kind: 'charge', amount })
const refund = (amount: number): OrderPayment => ({ kind: 'refund', amount })

// ---- What a merchant is shown ---------------------------------------------

describe('settlement summary on a placed order', () => {
  it('reports an unpaid order as owing its whole total', () => {
    const summary = summarizeOnWeb(250, [])

    expect(summary.amountPaid).toBe(0)
    expect(summary.balance).toBe(250)
    expect(summary.intent).toBe('collect')
  })

  it('reports a fully paid order as settled', () => {
    const summary = summarizeOnWeb(250, [charge(250)])

    expect(summary.balance).toBe(0)
    expect(summary.intent).toBe('settled')
  })

  /**
   * The journey this layer exists for: a ₱40 voucher attached to a paid ₱250
   * order. The merchant must be told to give ₱40 back.
   */
  it('turns a discount on a paid order into a refund due', () => {
    const summary = summarizeOnWeb(210, [charge(250)])

    expect(summary.balance).toBe(-40)
    expect(summary.intent).toBe('refund')
  })

  /** Charged and refunded are kept apart, not netted into one figure. */
  it('keeps what was charged separate from what was given back', () => {
    const summary = summarizeOnWeb(210, [charge(250), refund(40)])

    expect(summary.totalCharged).toBe(250)
    expect(summary.totalRefunded).toBe(40)
    expect(summary.amountPaid).toBe(210)
    expect(summary.intent).toBe('settled')
  })

  it('reports what is still owed after a part payment', () => {
    const summary = summarizeOnWeb(250, [charge(100)])

    expect(summary.balance).toBe(150)
    expect(summary.intent).toBe('collect')
  })
})

// ---- Parity with the register ---------------------------------------------

const LEDGERS: ReadonlyArray<readonly [string, readonly OrderPayment[]]> = [
  ['an unpaid order', []],
  ['a single full payment', [charge(250)]],
  ['a part payment', [charge(100)]],
  ['a payment then a refund', [charge(250), refund(40)]],
  ['an over-refund', [charge(100), refund(150)]],
  ['several charges and refunds', [charge(100), charge(60), refund(10), refund(5)]],
  ['a zero-amount row', [charge(0)]],
  ['fractional amounts', [charge(0.1), charge(0.2)]],
]

const TOTALS = [0, 0.3, 210, 250, 1000.555] as const

describe('settlement summary parity — web vs merchant app', () => {
  it.each(LEDGERS)('agrees on the account for %s', (_label, payments) => {
    for (const total of TOTALS) {
      const web = summarizeOnWeb(total, payments)
      const app = summarizeOnApp(total, payments)

      expect({
        totalCharged: web.totalCharged,
        totalRefunded: web.totalRefunded,
        amountPaid: web.amountPaid,
        balance: web.balance,
        intent: web.intent,
      }).toEqual({
        totalCharged: app.totalCharged,
        totalRefunded: app.totalRefunded,
        amountPaid: app.amountPaid,
        balance: app.balance,
        intent: app.intent,
      })
    }
  })
})
