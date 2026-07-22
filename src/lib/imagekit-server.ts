import 'server-only'
import { randomUUID } from 'crypto'
import {
  computeUploadSignature,
  isDeletablePaymentProofPath,
} from '@/lib/imagekit-signature'

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
