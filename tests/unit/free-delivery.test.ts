import {
  resolveFreeDeliveryThreshold,
  waiveDeliveryFee,
  amountToFreeDelivery,
} from '@/lib/free-delivery'

describe('resolveFreeDeliveryThreshold', () => {
  test('returns a positive finite amount as-is', () => {
    expect(resolveFreeDeliveryThreshold(500)).toBe(500)
  })

  test('parses a numeric string (PostgREST numeric)', () => {
    expect(resolveFreeDeliveryThreshold('750.50')).toBe(750.5)
  })

  test.each([null, undefined, 0, -100, Number.NaN, Number.POSITIVE_INFINITY, '', 'abc', true])(
    'treats %p as off',
    (raw) => {
      expect(resolveFreeDeliveryThreshold(raw)).toBeNull()
    }
  )
})

describe('waiveDeliveryFee', () => {
  test('zeroes the fee when the item subtotal meets the threshold exactly', () => {
    expect(waiveDeliveryFee(80, 500, 500)).toBe(0)
  })

  test('zeroes the fee when the item subtotal is above the threshold', () => {
    expect(waiveDeliveryFee(80, 1200, 500)).toBe(0)
  })

  test('keeps the fee when the item subtotal is below the threshold', () => {
    expect(waiveDeliveryFee(80, 499.99, 500)).toBe(80)
  })

  test('keeps the fee when free delivery is off', () => {
    expect(waiveDeliveryFee(80, 10_000, null)).toBe(80)
  })

  test('never invents a fee where there was none', () => {
    expect(waiveDeliveryFee(null, 1000, 500)).toBeNull()
    expect(waiveDeliveryFee(undefined, 1000, 500)).toBeUndefined()
  })
})

describe('amountToFreeDelivery', () => {
  test('returns the shortfall when below the threshold', () => {
    expect(amountToFreeDelivery(350, 500)).toBe(150)
  })

  test('rounds the shortfall to centavos', () => {
    expect(amountToFreeDelivery(0.1 + 0.2, 1)).toBe(0.7)
  })

  test('returns 0 once the threshold is met', () => {
    expect(amountToFreeDelivery(500, 500)).toBe(0)
    expect(amountToFreeDelivery(900, 500)).toBe(0)
  })

  test('returns null when free delivery is off', () => {
    expect(amountToFreeDelivery(350, null)).toBeNull()
  })
})
