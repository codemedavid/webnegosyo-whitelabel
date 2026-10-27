import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { APP_SESSION_TOKEN_PATTERN } from '@/lib/app-contract'

/**
 * Customer-app sessions: an opaque `cs1.` bearer token (256 random bits). Only
 * its hash is stored (customer_app_sessions.token_hash), under a label of its
 * own, so it can never be confused with a wallet (`ws1.`) or claim (`v1.`) token.
 */
const HASH_LABEL = 'customer-app-session-v1:'
const TOKEN_BYTES = 32

export function hashAppSessionToken(token: unknown): string | null {
  if (typeof token !== 'string' || !APP_SESSION_TOKEN_PATTERN.test(token)) return null
  return createHash('sha256').update(`${HASH_LABEL}${token}`).digest('hex')
}

export function createAppSessionToken(): { token: string; tokenHash: string } {
  const token = `cs1.${randomBytes(TOKEN_BYTES).toString('base64url')}`
  return { token, tokenHash: hashAppSessionToken(token) as string }
}

interface HeaderReader {
  get(name: string): string | null
}

/** The session's lookup hash from `Authorization: Bearer cs1.…`, or null. */
export function readBearerSession(headers: HeaderReader): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(headers.get('authorization')?.trim() ?? '')
  return match ? hashAppSessionToken(match[1]) : null
}
