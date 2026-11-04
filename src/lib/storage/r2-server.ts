import 'server-only'
import { randomUUID } from 'crypto'
import { AwsClient } from 'aws4fetch'
import { MEDIA_HOST } from '@/lib/storage/media-url'
import { buildObjectKey, R2_FILE_ID_PREFIX } from '@/lib/storage/object-key'

export { r2KeyFromFileId } from '@/lib/storage/object-key'
import { readR2Config, type R2Config } from '@/lib/storage/r2-config'

/**
 * Server-side Cloudflare R2 operations over its S3 API (SigV4 via aws4fetch).
 *
 * Every write carries `If-None-Match: *` — R2 answers 412 instead of replacing
 * an existing object — and an immutable Cache-Control (keys are unique, so a
 * stored URL never changes content). Credentials come from R2_* env vars and
 * must never reach the client bundle (hence `server-only`).
 */

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/** A browser asks for the URL right before uploading. */
const PRESIGN_TTL_SECONDS = 10 * 60
const PUT_TIMEOUT_MS = 30_000
const SMALL_REQUEST_TIMEOUT_MS = 8_000
const MAX_RETRIES = 2

export interface StoredObject {
  /** Public delivery URL on the media host. */
  url: string
  /** `r2:<key>` — what callers store as a file id (e.g. payment_proof_public_id). */
  fileId: string
  /** The object key, e.g. `menu-items/t1/adobo-ab12.jpg`. */
  filePath: string
}

export interface PresignedPut extends StoredObject {
  uploadUrl: string
  method: 'PUT'
  /** Headers the upload MUST send exactly — they are part of the signature. */
  headers: Record<string, string>
}

function requireConfig(): R2Config {
  const config = readR2Config()
  if (!config) throw new Error('Image upload is not configured.')
  return config
}

function client(config: R2Config): AwsClient {
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
    // aws4fetch retries 5xx/429 up to 10 times by default; a request path
    // must not hang on that.
    retries: MAX_RETRIES,
  })
}

function objectUrl(config: R2Config, key: string): string {
  const path = key.split('/').map(encodeURIComponent).join('/')
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${path}`
}

export function mediaUrlFor(key: string): string {
  return `https://${MEDIA_HOST}/${key.split('/').map(encodeURIComponent).join('/')}`
}

function stored(key: string): StoredObject {
  return { url: mediaUrlFor(key), fileId: `${R2_FILE_ID_PREFIX}${key}`, filePath: key }
}

/** A fresh unique key for an upload into `folder`. */
export function newObjectKey(folder: string, fileName: string, contentType: string): string {
  return buildObjectKey({ folder, fileName, contentType, id: randomUUID().replace(/-/g, '').slice(0, 16) })
}

function uploadHeaders(contentType: string, contentLength: number): Record<string, string> {
  return {
    'content-type': contentType,
    'content-length': String(contentLength),
    'cache-control': IMMUTABLE_CACHE_CONTROL,
    'if-none-match': '*',
  }
}

/** Store bytes the server already holds. Throws on failure — never pretends. */
export async function putR2Object(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
  const config = requireConfig()
  const res = await client(config).fetch(objectUrl(config, key), {
    method: 'PUT',
    body: bytes as BodyInit,
    headers: uploadHeaders(contentType, bytes.byteLength),
    signal: AbortSignal.timeout(PUT_TIMEOUT_MS),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[r2] upload failed', { key, status: res.status, detail: detail.slice(0, 300) })
    throw new Error(`Image upload failed (${res.status}).`)
  }
  return stored(key)
}

/**
 * A presigned PUT that binds the key, content type, exact size, cache policy
 * and no-overwrite: R2 refuses the upload if any of them differ.
 */
export async function presignR2Put(key: string, contentType: string, contentLength: number): Promise<PresignedPut> {
  const config = requireConfig()
  const headers = uploadHeaders(contentType, contentLength)
  const signed = await client(config).sign(
    new Request(`${objectUrl(config, key)}?X-Amz-Expires=${PRESIGN_TTL_SECONDS}`, { method: 'PUT', headers }),
    { aws: { signQuery: true, allHeaders: true } },
  )
  // content-length is set by the browser from the body; it must not send its own.
  const clientHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== 'content-length'))
  return { ...stored(key), uploadUrl: signed.url, method: 'PUT', headers: clientHeaders }
}

export interface R2ObjectInfo {
  size: number
  lastModified: number | null
}

/** Null when the object does not exist; throws on any other failure. */
export async function headR2Object(key: string): Promise<R2ObjectInfo | null> {
  const config = requireConfig()
  const res = await client(config).fetch(objectUrl(config, key), {
    method: 'HEAD',
    signal: AbortSignal.timeout(SMALL_REQUEST_TIMEOUT_MS),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`R2 lookup failed (${res.status}).`)
  const lastModified = Date.parse(res.headers.get('last-modified') ?? '')
  return {
    size: Number(res.headers.get('content-length') ?? 0),
    lastModified: Number.isFinite(lastModified) ? lastModified : null,
  }
}

/** True when deleted or already gone; logs and returns false otherwise. */
export async function deleteR2Object(key: string): Promise<boolean> {
  try {
    const config = requireConfig()
    const res = await client(config).fetch(objectUrl(config, key), {
      method: 'DELETE',
      signal: AbortSignal.timeout(SMALL_REQUEST_TIMEOUT_MS),
    })
    if (res.status === 204 || res.status === 200 || res.status === 404) return true
    console.error('[r2] delete failed', { key, status: res.status })
    return false
  } catch (error) {
    console.error('[r2] delete threw', { key, error: error instanceof Error ? error.message : String(error) })
    return false
  }
}
