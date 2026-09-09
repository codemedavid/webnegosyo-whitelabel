/**
 * `available_on_web` gates online ordering. Rows that predate the column
 * (undefined) and rows read through a projection that omits it (null) must
 * keep working — only an explicit `false` refuses.
 */

import { describe, test, expect } from '@jest/globals'
import {
  isOrderTypeOrderableOnWeb,
  WEB_UNAVAILABLE_ORDER_TYPE_MESSAGE,
} from '@/lib/order-types/order-type-availability'

describe('isOrderTypeOrderableOnWeb', () => {
  test('explicit false refuses', () => {
    expect(isOrderTypeOrderableOnWeb({ available_on_web: false })).toBe(false)
  })

  test('explicit true allows', () => {
    expect(isOrderTypeOrderableOnWeb({ available_on_web: true })).toBe(true)
  })

  test('a row that predates the column allows', () => {
    expect(isOrderTypeOrderableOnWeb({})).toBe(true)
    expect(isOrderTypeOrderableOnWeb({ available_on_web: undefined })).toBe(true)
  })

  test('a null column value allows', () => {
    expect(isOrderTypeOrderableOnWeb({ available_on_web: null })).toBe(true)
  })

  test('no row at all allows (the caller decides what a missing row means)', () => {
    expect(isOrderTypeOrderableOnWeb(null)).toBe(true)
    expect(isOrderTypeOrderableOnWeb(undefined)).toBe(true)
  })

  test('exports the customer-facing refusal message', () => {
    expect(WEB_UNAVAILABLE_ORDER_TYPE_MESSAGE).toBe(
      'This order type is not available for online ordering'
    )
  })
})
