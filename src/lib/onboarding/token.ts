/**
 * The buyer's key to their set-up wizard.
 *
 * The checkout lead's reference number is NOT a secret (four characters a day,
 * printed on screen and in chats), so the wizard — which creates a store and
 * its owner login — is opened with a separate 256-bit token. Only its sha256
 * is stored: a leaked database row cannot be replayed into someone's wizard.
 */

import { createHash, randomBytes } from 'crypto'

const TOKEN_BYTES = 32
/** base64url of 32 bytes, no padding. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export interface OnboardingToken {
  token: string
  hash: string
}

export function hashOnboardingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createOnboardingToken(): OnboardingToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return { token, hash: hashOnboardingToken(token) }
}

/** Shape check before any database read, so junk never costs a query. */
export function isWellFormedOnboardingToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}
