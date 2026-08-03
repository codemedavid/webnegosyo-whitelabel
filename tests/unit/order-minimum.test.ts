import {
  resolveOrderMinimum,
  checkOrderMinimum,
  formatOrderMinimumMessage,
} from '@/lib/order-minimum'

describe('resolveOrderMinimum', () => {
  test('returns the configured amount for an order type', () => {
    expect(resolveOrderMinimum({ minimum_order_amount: 500 })).toBe(500)
  })

  test('returns 0 when there is no order type at all', () => {
    expect(resolveOrderMinimum(null)).toBe(0)
    expect(resolveOrderMinimum(undefined)).toBe(0)
  })

  test('returns 0 for a tenant whose column has not been backfilled yet', () => {
    // Pre-migration rows arrive without the field — every existing store must
    // keep checking out exactly as before.
    expect(resolveOrderMinimum({})).toBe(0)
    expect(resolveOrderMinimum({ minimum_order_amount: null })).toBe(0)
  })

  test('treats a non-finite or negative amount as no minimum', () => {
    expect(resolveOrderMinimum({ minimum_order_amount: -100 })).toBe(0)
    expect(resolveOrderMinimum({ minimum_order_amount: Number.NaN })).toBe(0)
    expect(resolveOrderMinimum({ minimum_order_amount: Number.POSITIVE_INFINITY })).toBe(0)
  })

  test('coerces a numeric string, since numeric(10,2) can arrive as a string', () => {
    expect(resolveOrderMinimum({ minimum_order_amount: '500.00' })).toBe(500)
  })

  test('returns 0 for a non-numeric string rather than NaN', () => {
    expect(resolveOrderMinimum({ minimum_order_amount: 'abc' })).toBe(0)
  })
})

describe('checkOrderMinimum', () => {
  test('passes when no minimum is configured', () => {
    expect(checkOrderMinimum(0, null)).toEqual({
      minimum: 0,
      hasMinimum: false,
      meets: true,
      shortfall: 0,
    })
  })

  test('passes when the subtotal is above the minimum', () => {
    expect(checkOrderMinimum(750, { minimum_order_amount: 500 })).toEqual({
      minimum: 500,
      hasMinimum: true,
      meets: true,
      shortfall: 0,
    })
  })

  test('passes when the subtotal exactly equals the minimum', () => {
    // Boundary: "minimum order of 500" must accept an order of exactly 500.
    expect(checkOrderMinimum(500, { minimum_order_amount: 500 })).toEqual({
      minimum: 500,
      hasMinimum: true,
      meets: true,
      shortfall: 0,
    })
  })

  test('fails below the minimum and reports the shortfall', () => {
    expect(checkOrderMinimum(320, { minimum_order_amount: 500 })).toEqual({
      minimum: 500,
      hasMinimum: true,
      meets: false,
      shortfall: 180,
    })
  })

  test('rounds the shortfall to 2 decimals instead of leaking float drift', () => {
    // 500 - 499.1 is 0.9000000000000341 in binary floating point.
    expect(checkOrderMinimum(499.1, { minimum_order_amount: 500 }).shortfall).toBe(0.9)
  })

  test('treats an invalid subtotal as zero rather than passing the gate', () => {
    expect(checkOrderMinimum(Number.NaN, { minimum_order_amount: 500 })).toEqual({
      minimum: 500,
      hasMinimum: true,
      meets: false,
      shortfall: 500,
    })
  })

  test('does not block an empty cart when no minimum is set', () => {
    expect(checkOrderMinimum(0, { minimum_order_amount: 0 }).meets).toBe(true)
  })
})

describe('formatOrderMinimumMessage', () => {
  test('returns null when the order meets the minimum', () => {
    expect(formatOrderMinimumMessage(checkOrderMinimum(750, { minimum_order_amount: 500 }))).toBeNull()
  })

  test('returns null when there is no minimum at all', () => {
    expect(formatOrderMinimumMessage(checkOrderMinimum(0, null))).toBeNull()
  })

  test('names both the minimum and the shortfall so the customer knows what to do', () => {
    const message = formatOrderMinimumMessage(checkOrderMinimum(320, { minimum_order_amount: 500 }))
    expect(message).toContain('₱500.00')
    expect(message).toContain('₱180.00')
  })

  test('includes the order type name when one is given', () => {
    const message = formatOrderMinimumMessage(
      checkOrderMinimum(320, { minimum_order_amount: 500 }),
      'Delivery'
    )
    expect(message).toContain('Delivery')
  })
})
