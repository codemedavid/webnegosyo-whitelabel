import { describe, it, expect, jest } from '@jest/globals'
import { requestOutletGeoOrigin, GEO_TIMEOUT_MS } from '@/lib/outlets/geolocation'

/**
 * Auto-detection is a convenience, never a blocker. Every test here is really
 * one assertion: the customer reaches the branch list, whatever the browser
 * does — denied, silent, slow, or missing entirely.
 */

type SuccessFn = (position: { coords: { latitude: number; longitude: number } }) => void
type ErrorFn = (error: { code: number; message: string }) => void

const geoThat = (
  behaviour: (success: SuccessFn, failure: ErrorFn) => void
): { getCurrentPosition: (s: SuccessFn, f: ErrorFn, o?: unknown) => void } => ({
  getCurrentPosition: (success, failure) => behaviour(success, failure),
})

describe('requestOutletGeoOrigin', () => {
  it('returns the coordinates when the customer allows it', async () => {
    const geo = geoThat((success) =>
      success({ coords: { latitude: 14.55, longitude: 121.04 } })
    )
    await expect(requestOutletGeoOrigin(geo)).resolves.toEqual({
      origin: { latitude: 14.55, longitude: 121.04 },
      reason: 'granted',
    })
  })

  it('reports a denial without coordinates', async () => {
    const geo = geoThat((_success, failure) => failure({ code: 1, message: 'denied' }))
    await expect(requestOutletGeoOrigin(geo)).resolves.toEqual({
      origin: null,
      reason: 'denied',
    })
  })

  it('reports an unavailable position as unavailable, not denied', async () => {
    const geo = geoThat((_success, failure) => failure({ code: 2, message: 'no signal' }))
    const result = await requestOutletGeoOrigin(geo)
    expect(result.reason).toBe('unavailable')
    expect(result.origin).toBeNull()
  })

  it('gives up on a browser that never answers', async () => {
    jest.useFakeTimers()
    try {
      const geo = geoThat(() => {
        /* never calls back — the permission prompt the customer ignores */
      })
      const pending = requestOutletGeoOrigin(geo)
      jest.advanceTimersByTime(GEO_TIMEOUT_MS + 1)
      await expect(pending).resolves.toEqual({ origin: null, reason: 'timeout' })
    } finally {
      jest.useRealTimers()
    }
  })

  it('resolves immediately when the browser has no geolocation at all', async () => {
    await expect(requestOutletGeoOrigin(undefined)).resolves.toEqual({
      origin: null,
      reason: 'unsupported',
    })
  })

  it('treats a throwing geolocation API as unavailable rather than crashing', async () => {
    const geo = {
      getCurrentPosition: () => {
        throw new Error('blocked by permissions policy')
      },
    }
    await expect(requestOutletGeoOrigin(geo)).resolves.toEqual({
      origin: null,
      reason: 'unavailable',
    })
  })

  it('ignores a late answer that arrives after the timeout', async () => {
    jest.useFakeTimers()
    try {
      let late: SuccessFn | null = null
      const geo = geoThat((success) => {
        late = success
      })
      const pending = requestOutletGeoOrigin(geo)
      jest.advanceTimersByTime(GEO_TIMEOUT_MS + 1)
      const result = await pending
      // The browser finally answers; the already-settled promise must not change.
      late?.({ coords: { latitude: 1, longitude: 2 } })
      expect(result.reason).toBe('timeout')
      await expect(pending).resolves.toEqual({ origin: null, reason: 'timeout' })
    } finally {
      jest.useRealTimers()
    }
  })

  it('rejects nonsense coordinates instead of ranking branches against them', async () => {
    const geo = geoThat((success) =>
      success({ coords: { latitude: Number.NaN, longitude: 121 } })
    )
    const result = await requestOutletGeoOrigin(geo)
    expect(result.origin).toBeNull()
    expect(result.reason).toBe('unavailable')
  })
})
