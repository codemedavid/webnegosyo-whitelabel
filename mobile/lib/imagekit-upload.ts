import * as ImagePicker from 'expo-image-picker'
import { PAYMENT_PROOF_MAX_FILE_SIZE } from './payment-proof'

/**
 * Mobile payment-proof image picking + ImageKit upload.
 *
 * ImageKit requires a server-signed token for every client upload, so the flow
 * is: pick from the library → fetch upload auth from the web app → upload to
 * ImageKit → return { url, fileId, filePath }. Deletion (on replace, or after the
 * merchant verifies) goes through the same web app route.
 *
 * The web app base URL (EXPO_PUBLIC_WEB_BASE_URL) is the single required config —
 * the public key is delivered by the auth endpoint, so no ImageKit keys live in
 * the mobile bundle.
 */

const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL
const IMAGEKIT_UPLOAD_ENDPOINT = 'https://upload.imagekit.io/api/v1/files/upload'
const PAYMENT_PROOF_FOLDER = 'payment-proofs'

export interface PaymentProofUploadResult {
  url: string
  /** ImageKit fileId (stored in payment_proof_public_id) */
  fileId: string
  /** Path relative to the URL endpoint (used to scope deletion) */
  filePath: string
}

export function isImageKitConfigured(): boolean {
  return Boolean(WEB_BASE_URL)
}

interface UploadAuth {
  token: string
  expire: number
  signature: string
  publicKey: string
}

function baseUrl(): string {
  return (WEB_BASE_URL ?? '').replace(/\/$/, '')
}

async function fetchUploadAuth(): Promise<UploadAuth> {
  const res = await fetch(`${baseUrl()}/api/imagekit/auth`)
  if (!res.ok) {
    throw new Error('Could not authorize upload. Please try again.')
  }
  return (await res.json()) as UploadAuth
}

interface ImageKitUploadResponse {
  url?: string
  fileId?: string
  filePath?: string
  message?: string
}

/**
 * Launch the image library and upload the chosen image as a payment proof.
 * Returns the upload result, or null if the user cancels.
 * Throws on permission denial, oversize files, or upload failure.
 */
export async function pickAndUploadPaymentProof(): Promise<PaymentProofUploadResult | null> {
  if (!isImageKitConfigured()) {
    throw new Error('Image upload is not configured.')
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) {
    throw new Error('Photo library permission is required to upload a screenshot.')
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
    base64: false,
  })

  if (result.canceled || !result.assets?.length) {
    return null
  }

  const asset = result.assets[0]
  if (typeof asset.fileSize === 'number' && asset.fileSize > PAYMENT_PROOF_MAX_FILE_SIZE) {
    throw new Error('Screenshot is too large (max 5MB).')
  }

  const auth = await fetchUploadAuth()

  const formData = new FormData()
  // React Native FormData file shape.
  formData.append('file', {
    uri: asset.uri,
    name: asset.fileName ?? `payment-proof-${asset.assetId ?? 'image'}.jpg`,
    type: asset.mimeType ?? 'image/jpeg',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  formData.append('fileName', asset.fileName ?? `payment-proof-${asset.assetId ?? 'image'}.jpg`)
  formData.append('publicKey', auth.publicKey)
  formData.append('signature', auth.signature)
  formData.append('expire', String(auth.expire))
  formData.append('token', auth.token)
  formData.append('folder', PAYMENT_PROOF_FOLDER)
  formData.append('useUniqueFileName', 'true')

  const response = await fetch(IMAGEKIT_UPLOAD_ENDPOINT, { method: 'POST', body: formData })
  const json = (await response.json()) as ImageKitUploadResponse
  if (!response.ok || !json.url || !json.fileId || !json.filePath) {
    throw new Error(json.message ?? 'Failed to upload screenshot.')
  }

  return { url: json.url, fileId: json.fileId, filePath: json.filePath.replace(/^\//, '') }
}

/**
 * Best-effort delete of a previously-uploaded proof via the web app's delete route.
 * No-ops if the web base URL is not configured.
 */
export async function deletePaymentProof(fileId: string, filePath: string): Promise<void> {
  if (!fileId || !filePath || !WEB_BASE_URL) return
  try {
    await fetch(`${baseUrl()}/api/payment-proof/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, filePath }),
    })
  } catch {
    // Best-effort cleanup; never block the checkout flow.
  }
}
