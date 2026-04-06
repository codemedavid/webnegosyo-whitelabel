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
 * Verify a tracking token against an orderId.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyTrackingToken(orderId: string, token: string): boolean {
  if (!SECRET || !orderId || !token) return false

  try {
    const expected = crypto.createHmac('sha256', SECRET).update(orderId).digest('hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    const providedBuf = Buffer.from(token, 'hex')

    if (expectedBuf.length !== providedBuf.length) return false
    return crypto.timingSafeEqual(expectedBuf, providedBuf)
  } catch {
    return false
  }
}
