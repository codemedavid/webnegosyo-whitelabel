/**
 * Settlement math on the web, and its parity with the register's.
 *
 * The merchant app can answer "what does this customer still owe?" — it has
 * `webnegosyo-app/lib/order-balance.ts`, and every collect/refund/square
 * decision on the register routes through it. The web admin has no equivalent
 * at all: grep `recordPayment|amount_paid|balance` across
 * `order-detail-dialog.tsx` and `convex-order-sheet.tsx` and nothing comes back.
 *
 * That absence is why attaching a discount to a placed order cannot work on the
 * web yet. Taking ₱40 off a bill that is already fully paid does not just change
 * a total — it turns ₱40 into money owed BACK. Without a balance the discount
 * would silently be given away: the order would show the lower figure and no
 * one would ever be told to return the difference.
 *
 * Ported rather than re-derived, and pinned by parity the same way
 * `order-discount-parity.test.ts` and `staff-permissions-parity.test.ts` pin
 * theirs. The register and admin read the SAME order rows; a copy that drifts
 * has the cashier and the office disagreeing about what a customer paid, with
 * no way to tell which is right.
 */
import { describe, it, expect } from '@jest/globals'
import {
  amountPaid as paidOnWeb,
  computeBalance as balanceOnWeb,
  settlementIntent as intentOnWeb,
  type OrderPayment,
} from '@/lib/order-balance'
import {
  amountPaid as paidOnApp,
  computeBalance as balanceOnApp,
  settlementIntent as intentOnApp,
} from '../../webnegosyo-app/lib/order-balance'

const charge = (amount: number): OrderPayment => ({ kind: 'charge', amount })
const refund = (amount: number): OrderPayment => ({ kind: 'refund', amount })

// ---- What the web needs before it can discount a placed order --------------

describe('settlement on a placed order', () => {
  it('reports nothing owed on an untouched, fully paid order', () => {
    expect(balanceOnWeb(250, [charge(250)])).toBe(0)
    expect(intentOnWeb(balanceOnWeb(250, [charge(250)]))).toBe('settled')
  })

  /**
   * The journey this port exists for. ₱250 collected, then a ₱40 voucher is
   * attached in orders management. The customer is owed ₱40 back.
   */
  it('turns a discount on a fully paid order into money owed back', () => {
    const balance = balanceOnWeb(210, [charge(250)])

    expect(balance).toBe(-40)
    expect(intentOnWeb(balance)).toBe('refund')
  })

  /** The same discount on an unpaid order simply reduces what is collected. */
  it('reduces what is still to collect on an unpaid order', () => {
    const balance = balanceOnWeb(210, [])

    expect(balance).toBe(210)
    expect(intentOnWeb(balance)).toBe('collect')
  })

  it('nets a refund already issued against what was charged', () => {
    expect(paidOnWeb([charge(250), refund(40)])).toBe(210)
    expect(balanceOnWeb(210, [charge(250), refund(40)])).toBe(0)
  })

  /**
   * Read from an untyped database edge. One unreadable row must not make the
   * whole order's money unreadable — a NaN here would render every figure on
   * the screen as NaN.
   */
  it('skips an unreadable ledger row rather than poisoning the total', () => {
    expect(paidOnWeb([charge(250), charge(Number.NaN)])).toBe(250)
  })

  it('surfaces an over-refund rather than clamping it to zero', () => {
    expect(paidOnWeb([charge(100), refund(150)])).toBe(-50)
  })

  /** Sub-centavo float drift is an artifact, never something to hand a human. */
  it('treats sub-centavo drift as square', () => {
    expect(intentOnWeb(0.004)).toBe('settled')
    expect(intentOnWeb(-0.004)).toBe('settled')
  })

  it('does not treat a whole centavo as square', () => {
    expect(intentOnWeb(0.01)).toBe('collect')
    expect(intentOnWeb(-0.01)).toBe('refund')
  })
})

// ---- Parity with the register ---------------------------------------------

const LEDGERS: ReadonlyArray<readonly [string, readonly OrderPayment[]]> = [
  ['an unpaid order', []],
  ['a single full payment', [charge(250)]],
  ['a part payment', [charge(100)]],
  ['a payment then a refund', [charge(250), refund(40)]],
  ['an over-refund', [charge(100), refund(150)]],
  ['a ledger with a NaN amount', [charge(250), charge(Number.NaN)]],
  ['a ledger with an Infinity amount', [charge(Number.POSITIVE_INFINITY)]],
  ['a ledger of many small charges', [charge(0.1), charge(0.2), charge(0.3)]],
  ['a zero-amount row', [charge(0)]],
]

const TOTALS = [0, 0.01, 210, 250, 1000.555] as const

describe('settlement parity — web vs merchant app', () => {
  it.each(LEDGERS)('agrees what was paid on %s', (_label, payments) => {
    expect(paidOnWeb(payments)).toEqual(paidOnApp(payments))
  })

  it.each(LEDGERS)('agrees on the balance for %s', (_label, payments) => {
    for (const total of TOTALS) {
      expect(balanceOnWeb(total, payments)).toEqual(balanceOnApp(total, payments))
    }
  })

  it.each(LEDGERS)('agrees what to do about %s', (_label, payments) => {
    for (const total of TOTALS) {
      const balance = balanceOnWeb(total, payments)
      expect(intentOnWeb(balance)).toEqual(intentOnApp(balance))
    }
  })
})
