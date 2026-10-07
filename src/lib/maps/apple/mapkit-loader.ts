/**
 * Browser-only MapKit JS loader: one script tag, one `mapkit.init`, shared by
 * every map and address field on the page.
 *
 * The first token is fetched BEFORE the script, doubling as the availability
 * probe: a 503 means this deployment has no MapKit key, which is remembered
 * for the page's lifetime so callers can fall back without re-probing. Any
 * other failure is transient and the next call retries.
 */

import type { MapKit } from './mapkit-types'

const MAPKIT_SCRIPT_SRC = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js'
/** Fetched together on first use; the core script alone is small. */
const MAPKIT_LIBRARIES = 'map,annotations,services'
const TOKEN_ENDPOINT = '/api/maps/token'
const READY_CALLBACK = '__webnegosyoMapKitReady'
const SCRIPT_TIMEOUT_MS = 15_000
const UNCONFIGURED_STATUS = 503

const UNCONFIGURED = Symbol('mapkit-unconfigured')

let pending: Promise<MapKit> | null = null
let isUnconfigured = false

function unconfiguredError(): Error {
  return Object.assign(new Error('Apple Maps is not configured on this deployment'), { [UNCONFIGURED]: true })
}

export function isMapKitUnconfiguredError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && UNCONFIGURED in error
}

async function fetchToken(): Promise<string> {
  const response = await fetch(TOKEN_ENDPOINT, { cache: 'no-store', credentials: 'same-origin' })
  if (response.status === UNCONFIGURED_STATUS) {
    isUnconfigured = true
    throw unconfiguredError()
  }
  if (!response.ok) throw new Error(`MapKit token request failed with status ${response.status}`)
  return response.text()
}

function injectScript(): Promise<MapKit> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MapKit JS took too long to load')), SCRIPT_TIMEOUT_MS)
    const callbacks = window as unknown as Record<string, (() => void) | undefined>
    callbacks[READY_CALLBACK] = () => {
      clearTimeout(timer)
      delete callbacks[READY_CALLBACK]
      if (window.mapkit) resolve(window.mapkit)
      else reject(new Error('MapKit JS loaded without a mapkit global'))
    }

    const script = document.createElement('script')
    script.src = MAPKIT_SCRIPT_SRC
    script.crossOrigin = 'anonymous'
    script.async = true
    script.dataset.callback = READY_CALLBACK
    script.dataset.libraries = MAPKIT_LIBRARIES
    script.addEventListener('error', () => {
      clearTimeout(timer)
      script.remove()
      reject(new Error('MapKit JS failed to load'))
    })
    document.head.appendChild(script)
  })
}

async function start(): Promise<MapKit> {
  let prefetchedToken: string | null = await fetchToken()
  const mapkit = await injectScript()

  mapkit.init({
    language: 'en',
    authorizationCallback: (done) => {
      if (prefetchedToken) {
        const token = prefetchedToken
        prefetchedToken = null
        done(token)
        return
      }
      fetchToken()
        .then(done)
        .catch((error: unknown) => console.error('[mapkit] token refresh failed:', error))
    },
  })
  mapkit.addEventListener?.('error', (event) => {
    console.error('[mapkit] authorization error:', (event as unknown as { status?: string }).status)
  })
  return mapkit
}

export function loadMapKit(): Promise<MapKit> {
  if (isUnconfigured) return Promise.reject(unconfiguredError())
  if (!pending) {
    pending = start().catch((error: unknown) => {
      pending = null
      throw error
    })
  }
  return pending
}
