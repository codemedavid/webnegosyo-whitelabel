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
 * Operates on the ImageKit file path (relative to the URL endpoint).
 */
export function isDeletablePaymentProofPath(filePath: string): boolean {
  return (
    typeof filePath === 'string' &&
    filePath.length > 0 &&
    filePath.length < 512 &&
    filePath.includes(PAYMENT_PROOF_FOLDER) &&
    !filePath.includes('..')
  )
}
