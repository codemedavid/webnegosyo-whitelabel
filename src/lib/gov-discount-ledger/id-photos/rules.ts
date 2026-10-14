/**
 * Senior/PWD ID photos — the rules every route shares.
 *
 * Optional and off by default (`store_tax_profiles.id_photo_mode`). A photo is
 * personal data: it lives in a PRIVATE bucket with no storage policies, its
 * row is readable only by `discount_review` holders, a link to it lasts 60
 * seconds, and it is deleted 90 days after it was taken
 * (`20261012140000_gov_discount_id_photos.sql`).
 */

import { ID_PHOTO_RETENTION_DAYS } from '@/lib/gov-discount'

export const ID_PHOTO_BUCKET = 'gov-discount-id-photos'
export const ID_PHOTO_LINK_TTL_SECONDS = 60
/**
 * Same cap as the bucket's `file_size_limit`. Base64 makes it ~4 MB of JSON,
 * inside Vercel's 4.5 MB request limit. The app has no resize module, so the
 * camera's own JPEG quality keeps a photo under it.
 */
export const MAX_ID_PHOTO_BYTES = 3 * 1024 * 1024
/** A data URL a little over the byte cap once base64-encoded (4/3) plus its prefix. */
export const MAX_ID_PHOTO_DATA_URL_CHARS = Math.ceil((MAX_ID_PHOTO_BYTES * 4) / 3) + 64

const DAY_MS = 24 * 60 * 60 * 1000
const RETENTION_MS = ID_PHOTO_RETENTION_DAYS * DAY_MS

type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp'

const EXTENSIONS: Readonly<Record<PhotoType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/

export interface DecodedPhoto {
  contentType: PhotoType
  extension: string
  bytes: Buffer
}

export type DecodeOutcome =
  | { ok: true; photo: DecodedPhoto }
  | { ok: false; reason: 'invalid' | 'too_large' }

/** True when the bytes really are the image type the data URL claims. */
function hasMatchingSignature(bytes: Buffer, contentType: PhotoType): boolean {
  if (contentType === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (contentType === 'image/png') {
    return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  return bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
}

/** A camera data URL to bytes — refused unless it is a real JPEG/PNG/WebP within the cap. */
export function decodePhotoDataUrl(dataUrl: string): DecodeOutcome {
  if (dataUrl.length > MAX_ID_PHOTO_DATA_URL_CHARS) return { ok: false, reason: 'too_large' }
  const match = DATA_URL_RE.exec(dataUrl)
  if (!match) return { ok: false, reason: 'invalid' }
  const contentType = match[1] as PhotoType
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > MAX_ID_PHOTO_BYTES) return { ok: false, reason: 'too_large' }
  if (!hasMatchingSignature(bytes, contentType)) return { ok: false, reason: 'invalid' }
  return { ok: true, photo: { contentType, extension: EXTENSIONS[contentType], bytes } }
}

/** Objects are filed under their store, named by a random id — never by a name or ID number. */
export function idPhotoObjectPath(tenantId: string, photoId: string, extension: string): string {
  return `${tenantId}/${photoId}.${extension}`
}

/** A photo taken longer ago than the retention period may not be stored at all. */
export function isPastRetention(capturedAtIso: string, nowMs: number): boolean {
  const capturedMs = Date.parse(capturedAtIso)
  return !Number.isFinite(capturedMs) || nowMs - capturedMs >= RETENTION_MS
}

/** How a photo is matched to a sales-book grant: the order and the claimant on it. */
export function idPhotoKey(backend: string, externalOrderId: string, claimantRef: string): string {
  return `${backend}|${externalOrderId}|${claimantRef}`
}
