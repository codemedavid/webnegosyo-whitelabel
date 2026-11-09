/**
 * The token in a "Send pin link" URL.
 *
 * Deliberately NOT the tracking token: that one is permanent, read-only and
 * printed on receipts, and this one changes where an order goes. It is signed
 * for one purpose, one order and a short life.
 */

import 'server-only'
import crypto from 'crypto'

const PURPOSE = 'delivery-pin-link'
/** Long enough for a customer to see the text tonight, short enough not to outlive the order. */
export const PIN_LINK_TTL_SECONDS = 24 * 60 * 60

function signature(orderId: string, expiresAt: number, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${PURPOSE}:${orderId}:${expiresAt}`).digest('hex')
}

function readSecret(secret: string | undefined): string {
  if (!secret) throw new Error('API_SECRET is not configured')
  return secret
}

export function createPinLinkToken(orderId: string, now: Date = new Date(), secret: string | undefined = process.env.API_SECRET): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + PIN_LINK_TTL_SECONDS
  return `${expiresAt}.${signature(orderId, expiresAt, readSecret(secret))}`
}

export function verifyPinLinkToken(orderId: string, token: string, now: Date = new Date(), secret: string | undefined = process.env.API_SECRET): boolean {
  if (!secret || !orderId) return false
  const match = token.match(/^(\d{1,12})\.([0-9a-f]{64})$/)
  if (!match) return false
  const expiresAt = Number(match[1])
  if (expiresAt * 1000 <= now.getTime()) return false
  const expected = Buffer.from(signature(orderId, expiresAt, secret), 'hex')
  const provided = Buffer.from(match[2], 'hex')
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided)
}

export function pinLinkPath(tenantSlug: string, orderId: string, token: string): string {
  return `/${tenantSlug}/pin/${encodeURIComponent(orderId)}?t=${encodeURIComponent(token)}`
}
