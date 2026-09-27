/**
 * @jest-environment node
 */
import { DELIVERY_QUOTE_SIGNATURE_TTL_MS, signDeliveryQuote, verifyDeliveryQuote } from '@/lib/checkout/delivery-quote-signature'

const SECRET = 'test-secret'
const NOW = 1_800_000_000_000
const DESTINATION = { address: 'Home', lat: 14.7, lng: 121.1 }
const QUOTE = { tenantId: 'tenant-1', quotationId: 'q-123', fee: 180, destination: DESTINATION, expiresAt: NOW + 60_000 }
const EXPECTED = { tenantId: 'tenant-1', quotationId: 'q-123', destination: DESTINATION }

function sign(quote = QUOTE): string {
  const signature = signDeliveryQuote(quote, NOW, SECRET)
  if (!signature) throw new Error('expected a signature')
  return signature
}

describe('Lalamove quote signature', () => {
  it('returns the price Lalamove quoted for a valid signature', () => {
    expect(verifyDeliveryQuote(sign(), EXPECTED, NOW, SECRET)).toEqual({ ok: true, fee: 180 })
  })

  it('refuses a signature whose price was edited by the browser', () => {
    const [body, mac] = sign().split('.')
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    const forgedBody = Buffer.from(JSON.stringify({ ...decoded, fee: 1 })).toString('base64url')

    expect(verifyDeliveryQuote(`${forgedBody}.${mac}`, EXPECTED, NOW, SECRET)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('refuses a signature minted with another secret', () => {
    const signature = signDeliveryQuote(QUOTE, NOW, 'attacker-secret')

    expect(verifyDeliveryQuote(signature, EXPECTED, NOW, SECRET)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('refuses a signature for another store or another quotation', () => {
    const signature = sign()

    expect(verifyDeliveryQuote(signature, { ...EXPECTED, tenantId: 'tenant-2' }, NOW, SECRET)).toEqual({ ok: false, reason: 'mismatch' })
    expect(verifyDeliveryQuote(signature, { ...EXPECTED, quotationId: 'q-999' }, NOW, SECRET)).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('refuses a signature past its window', () => {
    const later = NOW + DELIVERY_QUOTE_SIGNATURE_TTL_MS + 1

    expect(verifyDeliveryQuote(sign(), EXPECTED, later, SECRET)).toEqual({ ok: false, reason: 'expired' })
  })

  it('refuses reuse for a different delivery address or map pin', () => {
    for (const destination of [
      { ...DESTINATION, address: 'Other home' },
      { ...DESTINATION, lat: 15 },
      { ...DESTINATION, lng: 122 },
    ]) {
      expect(verifyDeliveryQuote(sign(), { ...EXPECTED, destination }, NOW, SECRET))
        .toEqual({ ok: false, reason: 'mismatch' })
    }
  })

  it('expires exactly when the provider quotation expires', () => {
    expect(verifyDeliveryQuote(sign(), EXPECTED, QUOTE.expiresAt, SECRET))
      .toEqual({ ok: false, reason: 'expired' })
  })

  it('does not sign malformed, expired, or incomplete provider quotations', () => {
    for (const quote of [
      { ...QUOTE, quotationId: '' },
      { ...QUOTE, fee: Number.NaN },
      { ...QUOTE, fee: -1 },
      { ...QUOTE, expiresAt: NOW },
      { ...QUOTE, expiresAt: Number.NaN },
      { ...QUOTE, destination: { ...DESTINATION, lat: 91 } },
    ]) {
      expect(signDeliveryQuote(quote, NOW, SECRET)).toBeNull()
    }
  })

  it('refuses a missing or malformed signature', () => {
    expect(verifyDeliveryQuote(undefined, EXPECTED, NOW, SECRET)).toEqual({ ok: false, reason: 'missing' })
    expect(verifyDeliveryQuote(sign(), { ...EXPECTED, quotationId: undefined }, NOW, SECRET)).toEqual({ ok: false, reason: 'missing' })
    expect(verifyDeliveryQuote('no-dot', EXPECTED, NOW, SECRET)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyDeliveryQuote('a.b.c', EXPECTED, NOW, SECRET)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('reports an unconfigured deployment distinctly, and signs nothing there', () => {
    expect(signDeliveryQuote(QUOTE, NOW, null)).toBeNull()
    expect(verifyDeliveryQuote(sign(), EXPECTED, NOW, null)).toEqual({ ok: false, reason: 'unconfigured' })
  })
})
