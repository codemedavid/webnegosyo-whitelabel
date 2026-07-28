/**
 * Ask the browser where the customer is — without ever blocking them.
 *
 * The spec is explicit that auto-detection is a convenience, never a blocker,
 * and the browser API makes that surprisingly easy to get wrong: a customer who
 * neither allows nor denies the permission prompt leaves `getCurrentPosition`
 * pending forever. `positionOptions.timeout` does not cover that case in every
 * browser, so this wraps the call in a timeout of our own and always resolves.
 */

export const GEO_TIMEOUT_MS = 4000

export interface GeoPoint {
  latitude: number
  longitude: number
}

export type GeoOutcome = 'granted' | 'denied' | 'unavailable' | 'timeout' | 'unsupported'

export interface GeoResult {
  origin: GeoPoint | null
  reason: GeoOutcome
}

/** The slice of `navigator.geolocation` this module needs. */
export interface GeolocationLike {
  getCurrentPosition(
    onSuccess: (position: { coords: { latitude: number; longitude: number } }) => void,
    onError: (error: { code: number; message: string }) => void,
    options?: unknown
  ): void
}

const PERMISSION_DENIED = 1

const isFinitePoint = (latitude: unknown, longitude: unknown): boolean =>
  typeof latitude === 'number' &&
  Number.isFinite(latitude) &&
  typeof longitude === 'number' &&
  Number.isFinite(longitude)

export function requestOutletGeoOrigin(
  geolocation: GeolocationLike | undefined | null,
  options: { timeoutMs?: number } = {}
): Promise<GeoResult> {
  if (!geolocation) {
    return Promise.resolve({ origin: null, reason: 'unsupported' })
  }

  const timeoutMs = options.timeoutMs ?? GEO_TIMEOUT_MS

  return new Promise<GeoResult>((resolve) => {
    let settled = false
    const finish = (result: GeoResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => finish({ origin: null, reason: 'timeout' }), timeoutMs)

    try {
      geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          if (!isFinitePoint(latitude, longitude)) {
            // Ranking branches against NaN would put every distance at NaN and
            // silently scramble the order.
            finish({ origin: null, reason: 'unavailable' })
            return
          }
          finish({ origin: { latitude, longitude }, reason: 'granted' })
        },
        (error) => {
          finish({
            origin: null,
            reason: error?.code === PERMISSION_DENIED ? 'denied' : 'unavailable',
          })
        },
        { timeout: timeoutMs, maximumAge: 60_000, enableHighAccuracy: false }
      )
    } catch {
      // Some embeds throw synchronously (permissions policy, insecure origin).
      finish({ origin: null, reason: 'unavailable' })
    }
  })
}
