/**
 * Pickup-ticket QR codec.
 *
 * The pickup ticket is a SECOND payload kind riding the same lz-string +
 * FNV-1a envelope as the cart-handoff QR. The two must be distinguishable
 * from the scanned string alone, and adding the pickup kind must not change
 * how a legacy handoff payload decodes — the merchant app scans both with one
 * camera.
 */

import { compressToEncodedURIComponent } from 'lz-string'
import {
  encodePickupQr,
  decodePickupQr,
  encodeOrderToQr,
  decodeQrToOrder,
  type QrPickupPayloadV1,
} from '@/lib/qr-order-codec'

const basePickup: Omit<QrPickupPayloadV1, 'ck'> = {
  v: 1,
  k: 'pickup',
  tenantId: 'tenant-abc',
  orderId: 'order-123',
  token: 'a'.repeat(64),
  t: 1_700_000_000_000,
}

describe('pickup QR codec', () => {
  it('round-trips a pickup ticket through encode and decode', () => {
    // Arrange / Act
    const encoded = encodePickupQr(basePickup)
    const result = decodePickupQr(encoded)

    // Assert
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.orderId).toBe('order-123')
    expect(result.payload.tenantId).toBe('tenant-abc')
    expect(result.payload.token).toBe('a'.repeat(64))
    expect(result.payload.k).toBe('pickup')
  })

  it('reports empty for an empty string', () => {
    expect(decodePickupQr('')).toEqual({ ok: false, error: 'empty' })
  })

  it('reports corrupt for a string that is not a compressed payload', () => {
    const result = decodePickupQr('!!!not-a-payload!!!')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('corrupt')
  })

  it('reports checksum when any field is tampered with after encoding', () => {
    // Arrange: encode, then rewrite the orderId inside the payload while
    // keeping the original checksum — the exact attack the checksum guards.
    const encoded = encodePickupQr(basePickup)
    const decoded = decodePickupQr(encoded)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return

    const tampered = encodePickupQrWithChecksum({
      ...decoded.payload,
      orderId: 'someone-elses-order',
    })

    // Act
    const result = decodePickupQr(tampered)

    // Assert
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('checksum')
  })

  it('reports version for a payload from a newer schema', () => {
    const encoded = encodePickupQrWithChecksum({
      ...basePickup,
      v: 2 as unknown as 1,
      ck: 'deadbeef',
    })

    const result = decodePickupQr(encoded)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('version')
  })

  it('rejects a cart-handoff payload as not a pickup ticket', () => {
    // Arrange: a real handoff QR decompresses and parses fine, so the kind
    // check is the only thing standing between the two flows.
    const handoff = encodeOrderToQr({
      v: 1,
      cid: 'cid-1',
      t: 1_700_000_000_000,
      tenantId: 'tenant-abc',
      tenantSlug: 'abc',
      orderTypeId: 'ot-1',
      orderType: 'pickup',
      customerName: 'Ana',
      customerContact: '09171234567',
      customerData: {},
      items: [],
      total: 0,
    })

    const result = decodePickupQr(handoff)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('not_pickup')
  })

  it('leaves the existing cart-handoff decode path unchanged', () => {
    // Regression guard: the handoff QR is live in production. Adding the
    // pickup kind must not alter its round-trip.
    const handoff = encodeOrderToQr({
      v: 1,
      cid: 'cid-2',
      t: 1_700_000_000_000,
      tenantId: 'tenant-abc',
      tenantSlug: 'abc',
      orderTypeId: 'ot-1',
      orderType: 'dine_in',
      customerName: 'Ben',
      customerContact: '09170000000',
      customerData: { table: '4' },
      items: [
        {
          menuItemId: 'm-1',
          menuItemName: 'Latte',
          quantity: 2,
          price: 120,
          subtotal: 240,
        },
      ],
      total: 240,
    })

    const result = decodeQrToOrder(handoff)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.customerName).toBe('Ben')
    expect(result.payload.items[0].menuItemName).toBe('Latte')
  })

  it('does not decode a pickup ticket as a cart-handoff order', () => {
    // The reverse guard: a pickup ticket has no items and no cid, so letting
    // it through the handoff path would create an empty order.
    const pickup = encodePickupQr(basePickup)

    const result = decodeQrToOrder(pickup)

    expect(result.ok).toBe(false)
  })
})

/**
 * Re-encode an already-checksummed payload verbatim, so tests can craft
 * payloads whose checksum does NOT match their contents.
 */
function encodePickupQrWithChecksum(payload: QrPickupPayloadV1): string {
  return compressToEncodedURIComponent(JSON.stringify(payload))
}
