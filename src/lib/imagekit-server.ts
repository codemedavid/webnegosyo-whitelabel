import 'server-only'
import { randomUUID } from 'crypto'
import {
  buildUploadJwt,
  computeUploadSignature,
  detectImageMime,
  isDeletablePaymentProofPath,
  sanitizeUploadFolder,
} from '@/lib/imagekit-signature'
import { getUploadProvider } from '@/lib/storage/r2-config'
import {
  contentTypeForBytes,
  maxUploadBytesFor,
  normalizeUploadContentType,
  r2KeyFromFileId,
} from '@/lib/storage/object-key'

/** Loaded only on the R2 path, so ImageKit-only callers never load the S3 signer. */
const loadR2 = () => import('@/lib/storage/r2-server')

/**
 * Server-side ImageKit operations: client-upload auth params and asset deletion.
 *
 * The private key is read from IMAGEKIT_PRIVATE_KEY and must never reach the
 * client bundle (hence `server-only`). Unlike Cloudinary's unsigned upload
 * preset, ImageKit requires a server-generated signature for every client
 * upload — `getUploadAuthParams` produces it.
 */

export { isDeletablePaymentProofPath }

interface ImageKitCredentials {
  publicKey: string
  privateKey: string
  urlEndpoint: string
}

/** How long an upload-auth token stays valid (seconds). Must be < 1 hour. */
const UPLOAD_TOKEN_TTL_SECONDS = 40 * 60

function getCredentials(): ImageKitCredentials | null {
  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY
  const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT
  if (publicKey && privateKey && urlEndpoint) {
    return { publicKey, privateKey, urlEndpoint }
  }
  return null
}

export interface UploadAuthParams {
  token: string
  expire: number
  signature: string
  publicKey: string
}

const IMAGEKIT_UPLOAD_ENDPOINT = 'https://upload.imagekit.io/api/v1/files/upload'
/** Upload API v2: authenticated by a JWT that signs the upload parameters. */
const IMAGEKIT_UPLOAD_V2_ENDPOINT = 'https://upload.imagekit.io/api/v2/files/upload'
const IMAGEKIT_FILES_API = 'https://api.imagekit.io/v1/files'

function basicAuthHeader(privateKey: string): string {
  // ImageKit uses HTTP Basic auth with the private key as the username.
  return `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}`
}

export interface ImageKitServerUploadResult {
  /** Full delivery URL */
  url: string
  /** Opaque ImageKit file id (used for deletion) */
  fileId: string
  /** Path relative to the URL endpoint (leading slash normalized away) */
  filePath: string
}

interface ServerUploadOptions {
  folder: string
  fileName: string
}

/**
 * The R2 half of every server upload (`STORAGE_UPLOAD_PROVIDER=r2`). Same
 * result shape as ImageKit's, with `fileId` = `r2:<key>`, so callers and the
 * rows they write are unchanged.
 */
async function uploadBytesToR2(
  bytes: Uint8Array,
  { folder, fileName, mimeType }: ServerUploadOptions & { mimeType?: string },
): Promise<ImageKitServerUploadResult> {
  const safeFolder = sanitizeUploadFolder(folder)
  if (!safeFolder) throw new Error('Invalid upload folder.')
  if (bytes.byteLength === 0) throw new Error('The image is empty.')

  // The bytes win over a declared image type: a caller can't label other
  // content as an image.
  const sniffed = detectImageMime(bytes)
  const declared = mimeType ? normalizeUploadContentType(mimeType) : null
  if (declared?.startsWith('image/') && sniffed && declared !== sniffed) {
    throw new Error('The image type does not match its contents.')
  }
  const contentType = sniffed ?? declared ?? contentTypeForBytes(bytes, fileName)
  if (bytes.byteLength > maxUploadBytesFor(contentType)) throw new Error('The image is too large.')
  const { newObjectKey, putR2Object } = await loadR2()
  return putR2Object(newObjectKey(safeFolder, fileName, contentType), bytes, contentType)
}

/**
 * Server-side upload of a base64 image to ImageKit. Used by flows that already
 * hold the image bytes (e.g. the MCP, whose clients generate image files but have
 * no hosting of their own) rather than a browser that can sign a client upload.
 *
 * ImageKit authorizes server uploads with HTTP Basic auth (private key as the
 * username), so no token/signature is needed here. Accepts either a raw base64
 * string or a `data:` URI (the prefix is stripped before sending).
 *
 * Throws when credentials are missing, the upload is non-2xx, or the response is
 * missing required fields — callers must not proceed as if the image was hosted.
 */
export async function uploadBase64ToImageKit(
  base64: string,
  { folder, fileName }: ServerUploadOptions,
): Promise<ImageKitServerUploadResult> {
  if (getUploadProvider() === 'r2') {
    const commaAt = base64.indexOf(',')
    const raw = base64.startsWith('data:') && commaAt !== -1 ? base64.slice(commaAt + 1) : base64
    return uploadBytesToR2(new Uint8Array(Buffer.from(raw, 'base64')), { folder, fileName })
  }

  const creds = getCredentials()
  if (!creds) {
    throw new Error('Image upload is not configured.')
  }

  // Accept a data URI or a bare base64 string; ImageKit wants only the payload.
  const commaIndex = base64.indexOf(',')
  const payload = base64.startsWith('data:') && commaIndex !== -1 ? base64.slice(commaIndex + 1) : base64

  const auth = Buffer.from(`${creds.privateKey}:`).toString('base64')
  const form = new FormData()
  form.append('file', payload)
  form.append('fileName', fileName)
  form.append('folder', folder)
  form.append('useUniqueFileName', 'true')

  const res = await fetch(IMAGEKIT_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}` },
    body: form,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[imagekit] server upload failed', { status: res.status, detail })
    throw new Error(`ImageKit upload failed (${res.status}).`)
  }

  const json = (await res.json()) as { url?: string; fileId?: string; filePath?: string }
  if (!json.url || !json.fileId || !json.filePath) {
    throw new Error('ImageKit upload response was missing required fields.')
  }

  return {
    url: json.url,
    fileId: json.fileId,
    filePath: json.filePath.replace(/^\//, ''),
  }
}

/**
 * Generate the { token, expire, signature, publicKey } a browser/mobile client
 * needs to upload directly to the ImageKit upload endpoint. Returns null when
 * credentials are not configured.
 */
export function getUploadAuthParams(): UploadAuthParams | null {
  const creds = getCredentials()
  if (!creds) {
    console.error('[imagekit] missing credentials; cannot issue upload auth')
    return null
  }

  const token = randomUUID()
  const expire = Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_TTL_SECONDS
  const signature = computeUploadSignature(token, expire, creds.privateKey)

  return { token, expire, signature, publicKey: creds.publicKey }
}

/**
 * Delete a single ImageKit asset by fileId via the management API.
 * Returns true on success (or 404 = already gone); logs and returns false on any
 * failure (cleanup is best-effort and must never block the user-facing flow).
 */
export async function deleteImageKitAsset(fileId: string): Promise<boolean> {
  const r2Key = r2KeyFromFileId(fileId)
  if (r2Key !== null) {
    // The only caller purges payment proofs; never delete anything else on R2.
    if (!isDeletablePaymentProofPath(r2Key)) {
      console.warn('[r2] refused to delete outside the payment-proof folder', { fileId })
      return false
    }
    const { deleteR2Object } = await loadR2()
    return deleteR2Object(r2Key)
  }

  const creds = getCredentials()
  if (!creds) {
    console.error('[imagekit] missing credentials; cannot delete', { fileId })
    return false
  }

  try {
    // ImageKit uses HTTP Basic auth with the private key as the username.
    const auth = Buffer.from(`${creds.privateKey}:`).toString('base64')
    const res = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` },
    })

    // 204 = deleted, 404 = already gone (treat as success).
    if (res.status === 204 || res.status === 404) return true

    console.error('[imagekit] delete failed', { fileId, status: res.status })
    return false
  } catch (error) {
    console.error('[imagekit] delete threw', { fileId, error })
    return false
  }
}

/** Short: the client asks for a token immediately before each upload. */
const SIGNED_UPLOAD_TTL_SECONDS = 10 * 60

export interface SignedUploadToken {
  /** v2 JWT, sent as the `token` form field. */
  token: string
  publicKey: string
  /** The exact form fields the upload must carry — no more, no fewer. */
  fields: Readonly<Record<string, string>>
  uploadUrl: string
}

/**
 * Issue an ImageKit upload API v2 token that binds WHERE and HOW the file is
 * stored. `useUniqueFileName=true` + `overwriteFile=false` are in the signed
 * payload, so a token holder cannot replace an existing asset (a tenant's
 * logo, a payment QR) — ImageKit refuses any request whose parameters differ
 * from the payload. `folder`/`fileName` must already be sanitised by the caller.
 * Returns null when credentials are not configured.
 */
export function createSignedUploadToken({
  folder,
  fileName,
}: {
  folder: string
  fileName: string
}): SignedUploadToken | null {
  const creds = getCredentials()
  if (!creds) {
    console.error('[imagekit] missing credentials; cannot issue upload token')
    return null
  }

  const fields = {
    fileName,
    folder,
    useUniqueFileName: 'true',
    overwriteFile: 'false',
  }
  const token = buildUploadJwt(fields, {
    publicKey: creds.publicKey,
    privateKey: creds.privateKey,
    nowSec: Math.floor(Date.now() / 1000),
    ttlSec: SIGNED_UPLOAD_TTL_SECONDS,
  })

  return { token, publicKey: creds.publicKey, fields, uploadUrl: IMAGEKIT_UPLOAD_V2_ENDPOINT }
}

interface BufferUploadOptions {
  folder: string
  fileName: string
  mimeType: string
}

/**
 * Server-side upload of raw bytes the server has already validated. Always
 * unique-named and never overwriting, whatever the caller asked for. Throws on
 * missing credentials or a failed upload.
 */
export async function uploadBufferToImageKit(
  bytes: Uint8Array,
  { folder, fileName, mimeType }: BufferUploadOptions,
): Promise<ImageKitServerUploadResult> {
  if (getUploadProvider() === 'r2') return uploadBytesToR2(bytes, { folder, fileName, mimeType })

  const creds = getCredentials()
  if (!creds) {
    throw new Error('Image upload is not configured.')
  }

  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart], { type: mimeType }), fileName)
  form.append('fileName', fileName)
  form.append('folder', folder)
  form.append('useUniqueFileName', 'true')
  form.append('overwriteFile', 'false')

  const res = await fetch(IMAGEKIT_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(creds.privateKey) },
    body: form,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[imagekit] server buffer upload failed', { status: res.status, detail })
    throw new Error(`ImageKit upload failed (${res.status}).`)
  }

  const json = (await res.json()) as { url?: string; fileId?: string; filePath?: string }
  if (!json.url || !json.fileId || !json.filePath) {
    throw new Error('ImageKit upload response was missing required fields.')
  }

  return { url: json.url, fileId: json.fileId, filePath: json.filePath.replace(/^\//, '') }
}

/** ImageKit file ids are opaque short tokens; anything else is not one. */
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export type PaymentProofDeleteOutcome = 'deleted' | 'not_found' | 'forbidden' | 'failed'

interface PaymentProofDeleteOptions {
  /** Refuse files older than this (the pre-submit replace window). */
  maxAgeMs?: number
}

interface ImageKitFileDetails {
  filePath?: string
  createdAt?: string
}

/**
 * Delete a payment-proof screenshot by fileId — but only after asking ImageKit
 * where that file ACTUALLY lives. A caller-supplied path proves nothing about
 * the id sent beside it; deleting by id after checking a claimed path let
 * anyone delete any file (a tenant logo, a menu photo) whose id they knew.
 * With `maxAgeMs`, also refuses files older than the replace window, so an
 * anonymous caller cannot destroy proof already attached to a placed order.
 */
export async function deletePaymentProofAsset(
  fileId: string,
  { maxAgeMs }: PaymentProofDeleteOptions = {},
): Promise<PaymentProofDeleteOutcome> {
  const r2Key = typeof fileId === 'string' ? r2KeyFromFileId(fileId) : null
  if (r2Key !== null) return deletePaymentProofR2(r2Key, maxAgeMs)
  if (typeof fileId !== 'string' || !FILE_ID_PATTERN.test(fileId)) return 'forbidden'

  const creds = getCredentials()
  if (!creds) {
    console.error('[imagekit] missing credentials; cannot delete', { fileId })
    return 'failed'
  }

  let details: ImageKitFileDetails
  try {
    const res = await fetch(`${IMAGEKIT_FILES_API}/${encodeURIComponent(fileId)}/details`, {
      headers: { Authorization: basicAuthHeader(creds.privateKey) },
    })
    if (res.status === 404) return 'not_found'
    if (!res.ok) {
      console.error('[imagekit] file details lookup failed', { fileId, status: res.status })
      return 'failed'
    }
    details = (await res.json()) as ImageKitFileDetails
  } catch (error) {
    console.error('[imagekit] file details lookup threw', { fileId, error })
    return 'failed'
  }

  if (!details.filePath || !isDeletablePaymentProofPath(details.filePath)) {
    console.warn('[imagekit] refused to delete a file outside the payment-proof folder', {
      fileId,
      filePath: details.filePath,
    })
    return 'forbidden'
  }

  if (maxAgeMs !== undefined) {
    const createdAtMs = Date.parse(details.createdAt ?? '')
    if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > maxAgeMs) {
      return 'forbidden'
    }
  }

  return (await deleteImageKitAsset(fileId)) ? 'deleted' : 'failed'
}

/**
 * R2 twin of `deletePaymentProofAsset`: the key IS where the object lives, so
 * the folder check is on the key itself; the age check reads its Last-Modified.
 */
async function deletePaymentProofR2(key: string, maxAgeMs: number | undefined): Promise<PaymentProofDeleteOutcome> {
  if (!isDeletablePaymentProofPath(key)) return 'forbidden'

  const { deleteR2Object, headR2Object } = await loadR2()
  let info: Awaited<ReturnType<typeof headR2Object>>
  try {
    info = await headR2Object(key)
  } catch (error) {
    console.error('[r2] payment proof lookup failed', { key, error: error instanceof Error ? error.message : String(error) })
    return 'failed'
  }
  if (!info) return 'not_found'

  if (maxAgeMs !== undefined) {
    if (info.lastModified === null || Date.now() - info.lastModified > maxAgeMs) return 'forbidden'
  }

  return (await deleteR2Object(key)) ? 'deleted' : 'failed'
}
