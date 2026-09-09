// Server-only: the plaintext credential leaves this process exactly once, at
// enrollment, and is never stored. Only its digest lives in the device registry.
import 'server-only'
import { createHash, randomBytes } from 'node:crypto'

const CREDENTIAL_BYTES = 32
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43}$/
const DOMAIN = 'loyalty-sms-device-v1'

/** The credential carries 256 bits of entropy, so an unkeyed digest is enough
 *  and the registry survives rotation of the loyalty HMAC key. */
function digest(credential: string): string {
  return createHash('sha256').update(`${DOMAIN}:${credential}`).digest('hex')
}

export function generateDeviceCredential(): { credential: string; credentialHash: string } {
  const credential = randomBytes(CREDENTIAL_BYTES).toString('base64url')
  return { credential, credentialHash: digest(credential) }
}

/** Re-derives the registry hash from a presented credential, or null when the
 *  value is not shaped like one this server issued. */
export function hashDeviceCredential(credential: unknown): string | null {
  if (typeof credential !== 'string' || !CREDENTIAL_PATTERN.test(credential)) return null
  return digest(credential)
}
