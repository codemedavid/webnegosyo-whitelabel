// Loads the two independent 32-byte loyalty keys from deployment configuration.
// Fails closed: any missing or malformed key disables every consumer instead of
// running with a weak or shared key. Never log the values.
import 'server-only'
import { createLoyaltyClaimCrypto } from './claim-crypto'

const KEY_BYTES = 32
type Env = Record<string, string | undefined>

function decodeKey(value: string | undefined): Buffer | null {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9+/_-]+=*$/.test(value)) return null
  const decoded = Buffer.from(value, value.includes('-') || value.includes('_') ? 'base64url' : 'base64')
  return decoded.length === KEY_BYTES ? decoded : null
}

export function loadLoyaltyClaimCrypto(env: Env = process.env): ReturnType<typeof createLoyaltyClaimCrypto> | null {
  const hashKey = decodeKey(env.LOYALTY_HASH_KEY)
  const encryptionKey = decodeKey(env.LOYALTY_ENCRYPTION_KEY)
  if (!hashKey || !encryptionKey) return null
  try {
    return createLoyaltyClaimCrypto({ hashKey, encryptionKey })
  } catch {
    return null
  }
}
