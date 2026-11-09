/**
 * The `?m=` token on every link the Messenger bot sends.
 *
 * Replaces the raw `?psid=` the menu card used to carry: with that, any
 * browser could put anyone's PSID on an order, and an order's messages would
 * go to that person. This token names a `messenger_sessions` row (never the
 * PSID itself), is signed for one purpose, and expires.
 */

import 'server-only'
import crypto from 'crypto'
import { MESSENGER_LINK_TOKEN_PATTERN as TOKEN_PATTERN } from './link-token-shape'

const PURPOSE = 'messenger-link'
const VERSION = 'mt1'
/** A menu card stays in the chat; a customer comes back to it weeks later. */
export const MESSENGER_LINK_TTL_SECONDS = 30 * 24 * 60 * 60

function signature(sessionId: string, expiresAt: number, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${PURPOSE}:${sessionId}:${expiresAt}`).digest('base64url')
}

export function createMessengerLinkToken(
  sessionId: string,
  now: Date = new Date(),
  secret: string | undefined = process.env.API_SECRET,
): string | null {
  if (!secret || !/^[0-9a-f-]{36}$/.test(sessionId)) return null
  const expiresAt = Math.floor(now.getTime() / 1000) + MESSENGER_LINK_TTL_SECONDS
  return `${VERSION}.${expiresAt}.${sessionId}.${signature(sessionId, expiresAt, secret)}`
}

/** The session id the token names, or null when it is malformed, forged or expired. */
export function readMessengerLinkToken(
  token: string | null | undefined,
  now: Date = new Date(),
  secret: string | undefined = process.env.API_SECRET,
): string | null {
  if (!secret || !token) return null
  const match = token.match(TOKEN_PATTERN)
  if (!match) return null
  const [, rawExpiry, sessionId, provided] = match
  const expiresAt = Number(rawExpiry)
  if (expiresAt * 1000 <= now.getTime()) return null
  const expected = Buffer.from(signature(sessionId, expiresAt, secret))
  const given = Buffer.from(provided)
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? sessionId : null
}
