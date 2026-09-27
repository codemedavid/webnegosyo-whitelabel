import * as ImagePicker from 'expo-image-picker'
import { PAYMENT_PROOF_MAX_FILE_SIZE } from './payment-proof'

/**
 * Mobile payment-proof image picking + ImageKit upload.
 *
 * The selected screenshot is sent to the web app's bounded proof endpoint,
 * which validates the bytes and chooses a unique path server-side. No upload
 * credentials or ImageKit keys are issued to the customer app.
 * EXPO_PUBLIC_WEB_BASE_URL configures the upload and cleanup endpoints.
 */

const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL

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

function baseUrl(): string {
  return (WEB_BASE_URL ?? '').replace(/\/$/, '')
}

interface ImageKitUploadResponse {
  url?: string
  fileId?: string
  filePath?: string
  error?: string
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

  const formData = new FormData()
  // React Native FormData file shape.
  formData.append('file', {
    uri: asset.uri,
    name: asset.fileName ?? `payment-proof-${asset.assetId ?? 'image'}.jpg`,
    type: asset.mimeType ?? 'image/jpeg',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  const response = await fetch(`${baseUrl()}/api/payment-proof/upload`, { method: 'POST', body: formData })
  const json = (await response.json()) as ImageKitUploadResponse
  if (!response.ok || !json.url || !json.fileId || !json.filePath) {
    throw new Error(json.error ?? 'Failed to upload screenshot.')
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
