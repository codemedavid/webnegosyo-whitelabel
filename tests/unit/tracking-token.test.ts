/**
 * The tracking token as printed on receipts is the first 80 bits of the full
 * HMAC. Full-length tokens on receipts already in customers' hands must keep
 * working, truncated ones must verify, and nothing below the floor may pass.
 */
process.env.API_SECRET = 'test-secret'

// Imports hoist above the env assignment under SWC, and the module reads the
// secret at load time — so it is required lazily, after the secret exists.
/* eslint-disable @typescript-eslint/no-require-imports */
const {
  generateTrackingToken,
  generateShortTrackingToken,
  verifyTrackingToken,
  MIN_TRACKING_TOKEN_HEX,
} = require('@/lib/tracking-token') as typeof import('@/lib/tracking-token')

describe('tracking tokens', () => {
  const orderId = 'jh77d616dta0dzva90pfwm5ypd8dxt7h'

  it('prints a 20-hex token that is a prefix of the full one', () => {
    const short = generateShortTrackingToken(orderId)
    expect(short).toHaveLength(MIN_TRACKING_TOKEN_HEX)
    expect(generateTrackingToken(orderId).startsWith(short)).toBe(true)
  })

  it('verifies both the printed token and the full one', () => {
    expect(verifyTrackingToken(orderId, generateShortTrackingToken(orderId))).toBe(true)
    expect(verifyTrackingToken(orderId, generateTrackingToken(orderId))).toBe(true)
  })

  it('refuses anything below the floor, wrong, or malformed', () => {
    const short = generateShortTrackingToken(orderId)
    expect(verifyTrackingToken(orderId, short.slice(0, 18))).toBe(false)
    expect(verifyTrackingToken(orderId, short.slice(0, 19))).toBe(false)
    expect(verifyTrackingToken(orderId, short.replace(/^./, (c) => (c === '0' ? '1' : '0')))).toBe(false)
    expect(verifyTrackingToken(orderId, 'zz' + short.slice(2))).toBe(false)
    expect(verifyTrackingToken('other-order', short)).toBe(false)
    expect(verifyTrackingToken(orderId, generateTrackingToken(orderId) + 'ab')).toBe(false)
  })
})
