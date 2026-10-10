/**
 * A sign-up link's secret. Whoever holds the code gets a paid store, so only
 * its sha256 is stored (like the set-up token, `../token.ts`). 128 bits is
 * plenty for a single-use, expiring link and keeps the URL short enough to
 * paste into Messenger.
 */

import { createHash, randomBytes } from 'crypto'

const CODE_BYTES = 16
/** base64url of 16 bytes, no padding. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/

export interface InviteCode {
  code: string
  hash: string
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export function createInviteCode(): InviteCode {
  const code = randomBytes(CODE_BYTES).toString('base64url')
  return { code, hash: hashInviteCode(code) }
}

/** Shape check before any database read, so junk never costs a query. */
export function isWellFormedInviteCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_PATTERN.test(value)
}
