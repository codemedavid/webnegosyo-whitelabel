/**
 * Once the payment-method editor lists register-only and web-only order types
 * side by side, the merchant needs to be told which is which — "Grab" and
 * "Delivery" look identical as bare names.
 */

import { describe, test, expect } from '@jest/globals'
import { describeOrderTypeChannel } from '@/lib/order-types/order-type-availability'

describe('describeOrderTypeChannel', () => {
  test('a type on both channels needs no qualifier', () => {
    expect(describeOrderTypeChannel({ available_on_web: true, available_on_pos: true })).toBeNull()
  })

  test('legacy rows missing the columns read as both channels', () => {
    expect(describeOrderTypeChannel({})).toBeNull()
    expect(describeOrderTypeChannel({ available_on_web: null, available_on_pos: null })).toBeNull()
  })

  test('a register-only type says so', () => {
    expect(describeOrderTypeChannel({ available_on_web: false })).toBe('Register only')
  })

  test('an online-only type says so', () => {
    expect(describeOrderTypeChannel({ available_on_pos: false })).toBe('Online only')
  })
})
