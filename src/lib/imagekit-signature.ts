import { createHmac } from 'crypto'
import { PAYMENT_PROOF_FOLDER } from '@/lib/payment-proof'

/**
 * Pure ImageKit helpers (no env, no network, no `server-only`) so they can be
 * unit-tested directly. The server module (`imagekit-server.ts`) wraps these
 * with credentials and HTTP calls.
 */

/**
 * Compute the ImageKit client-upload signature.
 * Algorithm (per ImageKit docs): HMAC-SHA1 of (token + expire) keyed by the
 * private API key, returned as a hex digest.
 */
export function computeUploadSignature(
  token: string,
  expire: number,
  privateKey: string,
): string {
  return createHmac('sha1', privateKey).update(token + String(expire)).digest('hex')
}

/**
 * Only allow deleting assets inside the payment-proofs folder, to bound abuse.
 * Operates on the ImageKit file path (relative to the URL endpoint; ImageKit
 * itself reports it with a leading slash). A PREFIX match: a substring match
 * accepted any path that merely mentioned the folder name.
 */
export function isDeletablePaymentProofPath(filePath: string): boolean {
  if (typeof filePath !== 'string' || filePath.length === 0 || filePath.length >= 512) return false
  if (filePath.includes('..')) return false
  return filePath.replace(/^\/+/, '').startsWith(`${PAYMENT_PROOF_FOLDER}/`)
}

/** ImageKit refuses a v2 upload token whose exp is more than an hour past iat. */
const MAX_UPLOAD_JWT_TTL_SECONDS = 3600

export interface UploadJwtOptions {
  publicKey: string
  privateKey: string
  nowSec: number
  ttlSec: number
}

/**
 * Build the JWT that authenticates an ImageKit upload API **v2** request.
 *
 * Unlike the v1 signature (HMAC over token+expire only, so the uploader chose
 * folder/fileName/overwriteFile freely), v2 signs the upload parameters
 * themselves: ImageKit rejects the upload when the request's parameters differ
 * from the payload in any way, including a missing or extra one. Header is
 * `{alg: HS256, typ: JWT, kid: <public key>}`; values are strings except
 * iat/exp. See https://imagekit.io/docs/api-reference/upload-file/upload-file-v2
 */
export function buildUploadJwt(
  fields: Readonly<Record<string, string>>,
  { publicKey, privateKey, nowSec, ttlSec }: UploadJwtOptions,
): string {
  if (!Number.isInteger(ttlSec) || ttlSec <= 0 || ttlSec > MAX_UPLOAD_JWT_TTL_SECONDS) {
    throw new Error(`ImageKit upload token lifetime must be 1..${MAX_UPLOAD_JWT_TTL_SECONDS}s`)
  }
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'HS256', typ: 'JWT', kid: publicKey })
  const payload = encode({ ...fields, iat: nowSec, exp: nowSec + ttlSec })
  const signature = createHmac('sha256', privateKey).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

const MAX_FOLDER_LENGTH = 100
const FOLDER_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i

/**
 * Normalise a caller-requested upload folder, or null when it is not a plain
 * relative folder path (traversal, spaces, odd characters, too long).
 */
export function sanitizeUploadFolder(folder: string): string | null {
  if (typeof folder !== 'string') return null
  const trimmed = folder.trim().replace(/^\/+|\/+$/g, '')
  if (trimmed === '' || trimmed.length > MAX_FOLDER_LENGTH) return null
  return FOLDER_PATTERN.test(trimmed) ? trimmed : null
}

const MAX_FILE_NAME_LENGTH = 100

/** A safe single-segment file name: no separators, bounded, never empty. */
export function sanitizeUploadFileName(fileName: string): string {
  const cleaned = (typeof fileName === 'string' ? fileName : '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-MAX_FILE_NAME_LENGTH)
  return cleaned === '' ? 'upload' : cleaned
}

export type DetectedImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

function startsWithBytes(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((value, index) => bytes[offset + index] === value)
}

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const // "RIFF"
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const // "WEBP" at offset 8

/**
 * The image type a file really is, judged by its first bytes — never by the
 * client-declared MIME type or extension. Null for anything else (SVG, HTML,
 * PDF, executables), which is what keeps an anonymous upload from hosting
 * script-bearing content on the store's image domain.
 */
export function detectImageMime(bytes: Uint8Array): DetectedImageMime | null {
  if (startsWithBytes(bytes, JPEG_SIGNATURE)) return 'image/jpeg'
  if (startsWithBytes(bytes, PNG_SIGNATURE)) return 'image/png'
  if (startsWithBytes(bytes, RIFF_SIGNATURE) && startsWithBytes(bytes, WEBP_SIGNATURE, 8)) return 'image/webp'
  return null
}
