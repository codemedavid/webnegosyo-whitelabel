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
