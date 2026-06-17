import * as ImagePicker from 'expo-image-picker'
import { PAYMENT_PROOF_FOLDER, PAYMENT_PROOF_MAX_FILE_SIZE } from './payment-proof'

/**
 * Mobile payment-proof image picking + unsigned Cloudinary upload.
 *
 * Mirrors the web flow (next-cloudinary CldUploadWidget) but for React Native:
 * pick from the library, upload to Cloudinary's unsigned endpoint, and return the
 * secure_url + public_id so the order can store them and the screenshot can later
 * be deleted (on replace, or after the merchant verifies the payment).
 */

const CLOUD_NAME =
  process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.EXPO_PUBLIC_CLOUDINARY_CLOUDNAME
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET

export interface PaymentProofUploadResult {
  url: string
  publicId: string
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET)
}

interface CloudinaryUploadResponse {
  secure_url?: string
  public_id?: string
  error?: { message?: string }
}

/**
 * Launch the image library and upload the chosen image as a payment proof.
 * Returns the upload result, or null if the user cancels.
 * Throws on permission denial, oversize files, or upload failure.
 */
export async function pickAndUploadPaymentProof(): Promise<PaymentProofUploadResult | null> {
  if (!isCloudinaryConfigured()) {
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
  formData.append('upload_preset', UPLOAD_PRESET as string)
  formData.append('folder', PAYMENT_PROOF_FOLDER)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData },
  )

  const json = (await response.json()) as CloudinaryUploadResponse
  if (!response.ok || !json.secure_url || !json.public_id) {
    throw new Error(json.error?.message ?? 'Failed to upload screenshot.')
  }

  return { url: json.secure_url, publicId: json.public_id }
}

/**
 * Best-effort delete of a previously-uploaded proof via the web app's delete route.
 * Requires EXPO_PUBLIC_WEB_BASE_URL to be set; no-ops otherwise.
 */
export async function deletePaymentProof(publicId: string): Promise<void> {
  const baseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL
  if (!publicId || !baseUrl) return
  try {
    await fetch(`${baseUrl.replace(/\/$/, '')}/api/payment-proof/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId }),
    })
  } catch {
    // Best-effort cleanup; never block the checkout flow.
  }
}
