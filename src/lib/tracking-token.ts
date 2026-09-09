/**
 * Stateless HMAC-SHA256 tracking tokens for customer order tracking.
 *
 * Generates a deterministic token from orderId + API_SECRET so customers
 * can view their order status without authentication. No database writes needed.
 */

import crypto from 'crypto'

const SECRET = process.env.API_SECRET
if (!SECRET) {
  console.warn('[tracking-token] API_SECRET is not set — tracking tokens will not work')
}

/**
 * Generate a tracking token for an order.
 * Deterministic: same orderId always produces the same token.
 */
export function generateTrackingToken(orderId: string): string {
  if (!SECRET) throw new Error('API_SECRET is not configured')
  return crypto.createHmac('sha256', SECRET).update(orderId).digest('hex')
}

/**
 * The shortest token a verifier accepts, in hex characters: 80 bits, the
 * floor RFC 2104 sets for a truncated HMAC. A tracking token guards a name
 * and a total, not money — and every hex character it carries is another
 * module in a QR code printed on a 58mm slip.
 */
export const MIN_TRACKING_TOKEN_HEX = 20

/**
 * The tracking token as printed on receipts: the first 80 bits of the full
 * one. It takes the tracking URL from 140 characters to under 100, which
 * drops the QR from 49 modules to 41 and lets a thermal printer draw it from
 * a single ASCII-clean command. `verifyTrackingToken` accepts either length.
 */
export function generateShortTrackingToken(orderId: string): string {
  return generateTrackingToken(orderId).slice(0, MIN_TRACKING_TOKEN_HEX)
}

/**
 * Verify a tracking token against an orderId.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyTrackingToken(orderId: string, token: string): boolean {
  if (!SECRET || !orderId || !token) return false
  // A truncated token is compared against the same-length prefix of the
  // expected one; anything shorter than the floor, odd-length, or not hex
  // is refused before any comparison happens.
  if (token.length < MIN_TRACKING_TOKEN_HEX || token.length % 2 !== 0) return false
  if (!/^[0-9a-f]+$/i.test(token)) return false

  try {
    const expected = crypto.createHmac('sha256', SECRET).update(orderId).digest('hex')
    if (token.length > expected.length) return false
    const expectedBuf = Buffer.from(expected.slice(0, token.length), 'hex')
    const providedBuf = Buffer.from(token, 'hex')

    if (expectedBuf.length !== providedBuf.length) return false
    return crypto.timingSafeEqual(expectedBuf, providedBuf)
  } catch {
    return false
  }
}
