/**
 * The payment proof a checkout attaches, made safe to store.
 *
 * The proof URL is rendered as a link and an image on the merchant's order
 * screens. The checkout only ever uploads to ImageKit (`PaymentProofField` →
 * `uploadImageToImageKit`), so anything that is not an https URL on the
 * ImageKit host — or the configured custom endpoint's host — is dropped rather
 * than stored. Dropped, not refused: no real checkout sends one, and the
 * reference number (the other half of a proof) still goes through.
 */

import { getImageKitEndpoint } from '@/lib/imagekit-utils'

export const IMAGEKIT_DELIVERY_HOST = 'ik.imagekit.io'
const MAX_PROOF_URL_LENGTH = 2048
const MAX_PROOF_FILE_ID_LENGTH = 200
export const MAX_PROOF_REFERENCE_LENGTH = 500

export interface SanitizedPaymentProof {
  url: string | null
  publicId: string | null
  reference: string | null
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function isAllowedProofUrl(value: string, endpoint: string): boolean {
  if (value.length > MAX_PROOF_URL_LENGTH) return false
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') return false

  const allowedHosts = [IMAGEKIT_DELIVERY_HOST, endpoint ? hostOf(endpoint) : null]
  return allowedHosts.includes(parsed.host)
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value !== '' && value.length <= max ? value : null
}

/** `endpoint` defaults to NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT; injectable for tests. */
export function sanitizePaymentProof(
  raw: unknown,
  endpoint: string = getImageKitEndpoint()
): SanitizedPaymentProof | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const proof = raw as Record<string, unknown>

  const url = typeof proof.url === 'string' && isAllowedProofUrl(proof.url, endpoint) ? proof.url : null
  const reference =
    typeof proof.reference === 'string' && proof.reference.trim() !== ''
      ? proof.reference.trim().slice(0, MAX_PROOF_REFERENCE_LENGTH)
      : null

  return {
    url,
    publicId: boundedString(proof.publicId, MAX_PROOF_FILE_ID_LENGTH),
    reference,
  }
}
