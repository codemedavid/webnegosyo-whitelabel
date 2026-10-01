/**
 * Apple Wallet's per-pass `authenticationToken`.
 *
 * Every call a device makes to our web service carries `ApplePass <token>`.
 * The token is DERIVED from the serial with a server secret rather than
 * stored, so the latest pass can always be rebuilt with the same token and a
 * database leak does not hand out working device credentials.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_CONTEXT = 'webnegosyo-wallet-pass-v1'

export function deriveAppleAuthToken(secret: Buffer, serial: string): string {
  return createHmac('sha256', secret).update(`${TOKEN_CONTEXT}:${serial}`).digest('hex')
}

export function verifyAppleAuthToken(secret: Buffer, serial: string, presented: string | null): boolean {
  if (typeof presented !== 'string' || !/^[a-f0-9]{64}$/.test(presented)) return false
  const expected = Buffer.from(deriveAppleAuthToken(secret, serial), 'hex')
  return timingSafeEqual(expected, Buffer.from(presented, 'hex'))
}

/** The token from an `Authorization: ApplePass <token>` header. */
export function readApplePassAuthorization(header: string | null): string | null {
  const match = /^ApplePass (\S+)$/.exec(header?.trim() ?? '')
  return match ? match[1] : null
}

const MIN_SYNC_SECRET_LENGTH = 32

/**
 * The database's shared secret on `/api/loyalty/passes/sync`. Fails closed:
 * an unset or short configured secret refuses every call.
 */
export function verifySyncSecret(configured: string | undefined, presented: string | null): boolean {
  if (!configured || configured.length < MIN_SYNC_SECRET_LENGTH || !presented) return false
  const expected = createHmac('sha256', TOKEN_CONTEXT).update(configured).digest()
  const actual = createHmac('sha256', TOKEN_CONTEXT).update(presented).digest()
  return timingSafeEqual(expected, actual)
}
