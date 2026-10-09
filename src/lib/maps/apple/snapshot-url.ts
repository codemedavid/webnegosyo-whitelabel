/**
 * Apple Maps Web Snapshots: a signed URL for a static map image with one pin.
 *
 * The merchant app has no native map module, so a delivery address shows as a
 * picture of the spot rather than an interactive map. Apple renders the PNG;
 * the URL carries our team/key ids and an ES256 signature over its own path
 * and query, so it can be loaded by the device directly (no auth header) but
 * cannot be altered to draw a different place without breaking the signature.
 *
 * Server only: signing needs the MapKit private key.
 */

import 'server-only'
import { createPrivateKey, sign } from 'node:crypto'
import type { LatLng } from './mapkit-address'
import type { MapKitConfig } from './mapkit-token'

const SNAPSHOT_ORIGIN = 'https://snapshot.apple-mapkit.com'
const SNAPSHOT_PATH = '/api/v1/snapshot'

/** Apple's accepted ranges (points, before scale). */
export const SNAPSHOT_MIN_SIZE = 50
export const SNAPSHOT_MAX_SIZE = 640
const DEFAULT_ZOOM = 16
const DEFAULT_SCALE = 2
/** The app's accent, so the pin reads as "the customer's place". */
const PIN_COLOR = 'e4572e'

export interface SnapshotOptions {
  center: LatLng
  /** Width in points, clamped to Apple's range. */
  width: number
  /** Height in points, clamped to Apple's range. */
  height: number
  zoom?: number
  scale?: 1 | 2 | 3
}

function clampSize(value: number): number {
  const rounded = Math.round(value)
  return Math.min(SNAPSHOT_MAX_SIZE, Math.max(SNAPSHOT_MIN_SIZE, rounded))
}

/** Six decimals is ~10cm — finer adds nothing but cache-busting noise. */
function point(at: LatLng): string {
  return `${at.lat.toFixed(6)},${at.lng.toFixed(6)}`
}

export function signSnapshotUrl(config: MapKitConfig, options: SnapshotOptions): string {
  const center = point(options.center)
  const params = new URLSearchParams({
    center,
    z: String(options.zoom ?? DEFAULT_ZOOM),
    size: `${clampSize(options.width)}x${clampSize(options.height)}`,
    scale: String(options.scale ?? DEFAULT_SCALE),
    annotations: JSON.stringify([{ point: center, color: PIN_COLOR }]),
    teamId: config.teamId,
    keyId: config.keyId,
  })
  const signedPath = `${SNAPSHOT_PATH}?${params.toString()}`
  const signature = sign('sha256', Buffer.from(signedPath), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: 'ieee-p1363',
  })
  return `${SNAPSHOT_ORIGIN}${signedPath}&signature=${signature.toString('base64url')}`
}
