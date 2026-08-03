/**
 * Parity: the merchant app's copy of the discount reader must agree with the
 * web's, answer for answer.
 *
 * The register and the storefront read the SAME order rows. If the app's copy
 * drifts — accepts a blob the web rejects, or reads the column in the other
 * order — the same sale prints one discount on the receipt and shows another in
 * admin, and there is no way to tell which is right.
 *
 * This is the pattern `staff-permissions-parity.test.ts` established, and it
 * earned its keep: the desktop copy there had silently fallen a key behind and
 * nothing could see it. Behavioural parity is checked rather than byte parity,
 * because the two codebases differ in style (quotes, semicolons) and a
 * formatting diff is not a defect.
 */
import { describe, it, expect } from '@jest/globals'
import { readOrderDiscount as readOnWeb } from '@/lib/order-discount'
import { readOrderDiscount as readOnApp } from '../../../webnegosyo-app/lib/order-discount'

const payload = {
  total: 27.5,
  deliveryDiscount: 0,
  lines: [{ label: 'WELCOME10', amount: 27.5, code: 'WELCOME10' }],
  allocationsByLine: { 'line-1': 27.5 },
}

/**
 * Every shape an order can arrive in, including the malformed ones. The blob is
 * untyped at the database edge, so the cases that matter most are the ones a
 * reader must refuse rather than the ones it accepts.
 */
const CASES: ReadonlyArray<readonly [string, unknown]> = [
  ['an order with no discount at all', { total: 300 }],
  ['the Convex blob', { customerData: { discount: payload } }],
  ['the snake_case blob', { customer_data: { discount: payload } }],
  ['the Postgres column', { discount_data: payload }],
  [
    'both, where the column must win',
    { discount_data: payload, customerData: { discount: { ...payload, total: 999 } } },
  ],
  ['a blob whose discount is a string', { customerData: { discount: 'WELCOME10' } }],
  ['a blob whose discount is an array', { customerData: { discount: [payload] } }],
  ['a discount with a non-numeric total', { discount_data: { ...payload, total: '27.5' } }],
  ['a discount with a NaN total', { discount_data: { ...payload, total: Number.NaN } }],
  ['a discount missing its lines', { discount_data: { total: 27.5 } }],
  ['a null order', null],
  ['a string order', 'not an order'],
  ['an order that is an array', []],
]

describe('order discount reader parity — web vs merchant app', () => {
  it.each(CASES)('agrees on %s', (_label, order) => {
    expect(readOnApp(order)).toEqual(readOnWeb(order))
  })

  it('agrees that a zero-total discount is still a discount', () => {
    // A voucher that took nothing off (fully consumed by a cap, say) is not the
    // same as no voucher: the code was still burned.
    const zeroed = { discount_data: { ...payload, total: 0 } }

    expect(readOnApp(zeroed)).toEqual(readOnWeb(zeroed))
    expect(readOnApp(zeroed)).not.toBeNull()
  })
})
