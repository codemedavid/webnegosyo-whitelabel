/** @jest-environment node */
import { createPinLinkToken, PIN_LINK_TTL_SECONDS, pinLinkPath, verifyPinLinkToken } from '@/lib/delivery/pin-link-token'

const SECRET = 'test-secret'
const NOW = new Date('2026-11-06T00:00:00Z')

describe('pin link token', () => {
  it('verifies for its own order within its life', () => {
    const token = createPinLinkToken('order-1', NOW, SECRET)
    expect(verifyPinLinkToken('order-1', token, NOW, SECRET)).toBe(true)
  })

  it('refuses another order, another secret and a tampered expiry', () => {
    const token = createPinLinkToken('order-1', NOW, SECRET)
    expect(verifyPinLinkToken('order-2', token, NOW, SECRET)).toBe(false)
    expect(verifyPinLinkToken('order-1', token, NOW, 'other')).toBe(false)
    const [expiry, signature] = token.split('.')
    expect(verifyPinLinkToken('order-1', `${Number(expiry) + 999}.${signature}`, NOW, SECRET)).toBe(false)
  })

  it('expires', () => {
    const token = createPinLinkToken('order-1', NOW, SECRET)
    const later = new Date(NOW.getTime() + (PIN_LINK_TTL_SECONDS + 1) * 1000)
    expect(verifyPinLinkToken('order-1', token, later, SECRET)).toBe(false)
  })

  it.each(['', 'abc', '123.xyz', '123.abc', `123.${'g'.repeat(64)}`])('refuses %p', (token) => {
    expect(verifyPinLinkToken('order-1', token, NOW, SECRET)).toBe(false)
  })

  it('is not the permanent tracking token', async () => {
    const crypto = await import('crypto')
    const trackingToken = crypto.createHmac('sha256', SECRET).update('order-1').digest('hex')
    expect(verifyPinLinkToken('order-1', trackingToken, NOW, SECRET)).toBe(false)
    expect(verifyPinLinkToken('order-1', `9999999999.${trackingToken}`, NOW, SECRET)).toBe(false)
  })

  it('refuses everything without a secret', () => {
    const token = createPinLinkToken('order-1', NOW, SECRET)
    expect(verifyPinLinkToken('order-1', token, NOW, '')).toBe(false)
    expect(() => createPinLinkToken('order-1', NOW, '')).toThrow('API_SECRET')
  })

  it('builds the path under the store', () => {
    expect(pinLinkPath('shop', 'order 1', '1.ab')).toBe('/shop/pin/order%201?t=1.ab')
  })
})
