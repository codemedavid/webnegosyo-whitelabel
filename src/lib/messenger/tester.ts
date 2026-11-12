/**
 * "Send test to me": the owner links their OWN Messenger to the editor by
 * messaging their Page a short code shown in the editor (10 minutes, one
 * use). Only the code's hash is stored. Service role only.
 */

import crypto from 'crypto'

export const TESTER_CODE_TTL_MS = 10 * 60 * 1000
const CODE_PATTERN = /^\s*test\s*(\d{6})\s*$/i

export function newTesterCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashTesterCode(tenantId: string, code: string): string {
  return crypto.createHash('sha256').update(`messenger-tester:${tenantId}:${code}`).digest('hex')
}

/** The code in a message like "TEST 482193", or null. */
export function readTesterCode(text: string): string | null {
  return text.match(CODE_PATTERN)?.[1] ?? null
}

export function isTesterCodeValid(input: {
  tenantId: string
  code: string
  storedHash: string | null
  expiresAt: Date | null
  now: Date
}): boolean {
  if (!input.storedHash || !input.expiresAt || input.expiresAt.getTime() <= input.now.getTime()) return false
  const expected = Buffer.from(input.storedHash, 'hex')
  const given = Buffer.from(hashTesterCode(input.tenantId, input.code), 'hex')
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}
