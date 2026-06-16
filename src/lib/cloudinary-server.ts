import 'server-only'
import { createHash } from 'crypto'
import { PAYMENT_PROOF_FOLDER } from '@/lib/payment-proof'

/**
 * Server-side Cloudinary admin operations (deletion).
 *
 * Credentials are read from CLOUDINARY_URL (cloudinary://<api_key>:<api_secret>@<cloud_name>),
 * falling back to discrete CLOUDINARY_* env vars. This module is server-only — the
 * api_secret must never reach the client bundle.
 */

interface CloudinaryCredentials {
  cloudName: string
  apiKey: string
  apiSecret: string
}

function getCredentials(): CloudinaryCredentials | null {
  const url = process.env.CLOUDINARY_URL
  if (url) {
    // cloudinary://<api_key>:<api_secret>@<cloud_name>
    const match = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/)
    if (match) {
      return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] }
    }
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret }
  }

  return null
}

/** Only allow deleting assets inside the payment-proofs folder, to bound abuse. */
export function isDeletablePaymentProofId(publicId: string): boolean {
  return (
    typeof publicId === 'string' &&
    publicId.length > 0 &&
    publicId.length < 512 &&
    publicId.includes(PAYMENT_PROOF_FOLDER) &&
    !publicId.includes('..')
  )
}

/**
 * Delete a single Cloudinary asset by public_id via the signed destroy endpoint.
 * Returns true on success; logs and returns false on any failure (cleanup is
 * best-effort and must never block the user-facing flow).
 */
export async function deleteCloudinaryAsset(publicId: string): Promise<boolean> {
  const creds = getCredentials()
  if (!creds) {
    console.error('[cloudinary] missing credentials; cannot delete', { publicId })
    return false
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000)
    // Signature = sha1 of sorted params ("public_id=...&timestamp=...") + api_secret
    const toSign = `public_id=${publicId}&timestamp=${timestamp}`
    const signature = createHash('sha1').update(toSign + creds.apiSecret).digest('hex')

    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: creds.apiKey,
      signature,
    })

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${creds.cloudName}/image/destroy`,
      { method: 'POST', body },
    )

    if (!res.ok) {
      console.error('[cloudinary] destroy failed', { publicId, status: res.status })
      return false
    }

    const json = (await res.json()) as { result?: string }
    // "ok" = deleted, "not found" = already gone (treat as success)
    return json.result === 'ok' || json.result === 'not found'
  } catch (error) {
    console.error('[cloudinary] destroy threw', { publicId, error })
    return false
  }
}
