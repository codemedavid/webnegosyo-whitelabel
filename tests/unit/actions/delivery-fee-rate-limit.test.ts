/**
 * The distance-fee quote is anonymous and every call may spend a paid road
 * distance lookup (Apple / Mapbox). Like the Lalamove quotation action it is
 * capped per client IP and per store; both caps fail open (a Redis outage
 * must not take delivery quotes away from real customers).
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

type Limit = { allowed: boolean; retryAfterSec: number }
const checkActionRateLimit = jest.fn(async (...args: unknown[]): Promise<Limit> => { void args; return { allowed: true, retryAfterSec: 0 } })
const checkRateLimit = jest.fn(async (...args: unknown[]) => { void args; return { allowed: true, remaining: 1, retryAfterSec: 0 } })
const from = jest.fn()

jest.mock('@/lib/action-rate-limit', () => ({
  checkActionRateLimit: (...args: unknown[]) => checkActionRateLimit(...args),
}))
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}))
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (...args: unknown[]) => from(...args) }),
}))
jest.mock('@/lib/maps/road-distance-server', () => ({ measureRoadDistanceKm: async () => 2 }))

async function quote() {
  const { calculateDistanceDeliveryFeeAction } = await import('@/app/actions/delivery')
  return calculateDistanceDeliveryFeeAction('t1', 14.55, 121.02)
}

beforeEach(() => {
  checkActionRateLimit.mockClear()
  checkRateLimit.mockClear()
  from.mockReset()
  from.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: {
            lalamove_enabled: false,
            distance_delivery_enabled: true,
            delivery_price_per_km: 10,
            delivery_min_fee: 50,
            delivery_radius_km: 10,
            restaurant_latitude: 14.56,
            restaurant_longitude: 121.03,
          },
          error: null,
        }),
      }),
    }),
  })
})

describe('calculateDistanceDeliveryFeeAction rate limits', () => {
  test('refuses a client over the per-IP limit before any lookup', async () => {
    // Arrange
    checkActionRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSec: 30 })

    // Act
    const result = await quote()

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/too many/i)
    expect(checkActionRateLimit).toHaveBeenCalledWith('distance-fee-client', { limit: 10, windowSec: 60 })
    expect(from).not.toHaveBeenCalled()
  })

  test('refuses a store over the per-tenant limit before any lookup', async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 30 })

    const result = await quote()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/too many/i)
    expect(checkRateLimit).toHaveBeenCalledWith('distance-fee:t1', { limit: 30, windowSec: 60 })
    expect(from).not.toHaveBeenCalled()
  })

  test('limits fail open: no onRedisFailure mode is requested', async () => {
    await quote()

    const options = [...checkActionRateLimit.mock.calls, ...checkRateLimit.mock.calls].map((call) => call[1] as Record<string, unknown>)
    expect(options.every((option) => option.onRedisFailure === undefined)).toBe(true)
  })

  test('an allowed call still prices the delivery', async () => {
    const result = await quote()

    expect(result.success).toBe(true)
    expect(result.data?.withinRadius).toBe(true)
  })

  test('invalid coordinates are refused without spending the limit', async () => {
    const { calculateDistanceDeliveryFeeAction } = await import('@/app/actions/delivery')

    const result = await calculateDistanceDeliveryFeeAction('t1', Number.NaN, 121)

    expect(result.success).toBe(false)
    expect(checkActionRateLimit).not.toHaveBeenCalled()
  })
})
