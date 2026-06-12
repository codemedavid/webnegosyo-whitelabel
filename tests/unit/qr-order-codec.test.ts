import {
  QR_SCHEMA_VERSION,
  QR_SIZE_WARN_THRESHOLD,
  fnv1aHex,
  computeChecksum,
  encodeOrderToQr,
  decodeQrToOrder,
} from '@/lib/qr-order-codec'
import { compressToEncodedURIComponent } from 'lz-string'
import type { QrOrderPayloadV1, QrOrderItemV1 } from '@/types/qr-order'

function makeBasePayload(): Omit<QrOrderPayloadV1, 'ck'> {
  return {
    v: 1,
    cid: '11111111-2222-3333-4444-555555555555',
    t: 1735689600000,
    tenantId: 'tenant-abc',
    tenantSlug: 'taco-town',
    orderTypeId: 'ot-1',
    orderType: 'dine_in',
    customerName: 'Maria Santos',
    customerContact: '+639171234567',
    customerData: { tableNumber: '12', notes: 'window seat' },
    items: [
      {
        menuItemId: 'item-1',
        menuItemName: 'Carnitas Taco',
        quantity: 2,
        price: 120,
        subtotal: 240,
        variationSelections: [
          { typeName: 'Size', optionName: 'Large', priceAdjustment: 20 },
        ],
        addons: [{ name: 'Extra Cheese', price: 15, quantity: 1 }],
        specialInstructions: 'no onions',
      },
    ],
    total: 240,
    paymentMethodId: 'pm-1',
    paymentMethod: 'cash',
  }
}

describe('fnv1aHex', () => {
  it('produces an 8-char lowercase hex string', () => {
    const hash = fnv1aHex('hello world')
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('is deterministic for the same input', () => {
    expect(fnv1aHex('webnegosyo')).toBe(fnv1aHex('webnegosyo'))
  })

  it('differs for different inputs', () => {
    expect(fnv1aHex('a')).not.toBe(fnv1aHex('b'))
  })

  it('matches the known FNV-1a 32-bit vector for an empty string', () => {
    // FNV offset basis 0x811c9dc5 -> "811c9dc5"
    expect(fnv1aHex('')).toBe('811c9dc5')
  })
})

describe('computeChecksum', () => {
  it('is order-independent of object literal shape (canonicalizes keys)', () => {
    const a = makeBasePayload()
    // Reconstruct with keys inserted in a different order; checksum must match
    // because computeChecksum re-orders to the canonical sequence.
    const reordered = {
      total: a.total,
      items: a.items,
      v: a.v,
      cid: a.cid,
      t: a.t,
      tenantId: a.tenantId,
      tenantSlug: a.tenantSlug,
      orderTypeId: a.orderTypeId,
      orderType: a.orderType,
      customerName: a.customerName,
      customerContact: a.customerContact,
      customerData: a.customerData,
      paymentMethodId: a.paymentMethodId,
      paymentMethod: a.paymentMethod,
    } as Omit<QrOrderPayloadV1, 'ck'>
    expect(computeChecksum(reordered)).toBe(computeChecksum(a))
  })

  it('changes when payload data changes', () => {
    const a = makeBasePayload()
    const b = { ...a, total: 999 }
    expect(computeChecksum(b)).not.toBe(computeChecksum(a))
  })
})

describe('encodeOrderToQr / decodeQrToOrder', () => {
  it('round-trips a payload with full equality', () => {
    const payload = makeBasePayload()
    const encoded = encodeOrderToQr(payload)
    const result = decodeQrToOrder(encoded)

    expect(result.ok).toBe(true)
    if (!result.ok) return // narrow for TS

    // The decoded payload equals the input plus the computed checksum.
    expect(result.payload).toEqual({
      ...payload,
      ck: computeChecksum(payload),
    })
    expect(result.payload.v).toBe(QR_SCHEMA_VERSION)
  })

  it('attaches a valid checksum on encode', () => {
    const payload = makeBasePayload()
    const encoded = encodeOrderToQr(payload)
    const result = decodeQrToOrder(encoded)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.ck).toBe(computeChecksum(payload))
    expect(result.payload.ck).toMatch(/^[0-9a-f]{8}$/)
  })

  it('returns "empty" for an empty string', () => {
    const result = decodeQrToOrder('')
    expect(result).toEqual({ ok: false, error: 'empty' })
  })

  it('returns "corrupt" for non-decompressible garbage', () => {
    // lz-string returns null/throws on input it cannot decompress cleanly.
    const result = decodeQrToOrder('!!!not-valid-lz-string-data!!!')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('corrupt')
  })

  it('returns "checksum" when the encoded string is mutated mid-payload', () => {
    const payload = makeBasePayload()
    const encoded = encodeOrderToQr(payload)

    // Mutate a character near the middle to corrupt the decompressed JSON
    // content while keeping it decompressible. Scan until a flipped char still
    // decompresses to parseable JSON but fails the checksum.
    let mutatedResult = decodeQrToOrder(encoded)
    const mid = Math.floor(encoded.length / 2)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let offset = 0; offset < encoded.length; offset++) {
      const idx = (mid + offset) % encoded.length
      const original = encoded[idx]
      for (const ch of alphabet) {
        if (ch === original) continue
        const mutated = encoded.slice(0, idx) + ch + encoded.slice(idx + 1)
        const r = decodeQrToOrder(mutated)
        if (!r.ok && r.error === 'checksum') {
          mutatedResult = r
          break
        }
      }
      if (!mutatedResult.ok && mutatedResult.error === 'checksum') break
    }

    expect(mutatedResult.ok).toBe(false)
    if (mutatedResult.ok) return
    expect(mutatedResult.error).toBe('checksum')
  })

  it('detects a tampered ck directly (re-encoded with bad checksum)', () => {
    const payload = makeBasePayload()
    const tampered: QrOrderPayloadV1 = { ...payload, ck: 'deadbeef' }
    // Re-encode the tampered full object directly (bypassing encodeOrderToQr's
    // checksum computation) to guarantee a checksum mismatch.
    const encoded = compressToEncodedURIComponent(JSON.stringify(tampered))
    const result = decodeQrToOrder(encoded)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('checksum')
  })

  it('returns "version" for a wrong schema version', () => {
    const payload = makeBasePayload()
    // Build a v2 payload and compute a *valid* checksum for it so we are sure
    // the version check fires before the checksum check.
    const wrongVersion = { ...payload, v: 2 } as unknown as Omit<
      QrOrderPayloadV1,
      'ck'
    >
    const ck = computeChecksum(wrongVersion)
    const full = { ...wrongVersion, ck }
    const encoded = compressToEncodedURIComponent(JSON.stringify(full))

    const result = decodeQrToOrder(encoded)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('version')
  })

  it('returns "corrupt" for decompressible-but-non-JSON content', () => {
    const encoded = compressToEncodedURIComponent('this is not json {{{')
    const result = decodeQrToOrder(encoded)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('corrupt')
  })
})

describe('QR size threshold', () => {
  function buildMultiItemPayload(count: number): Omit<QrOrderPayloadV1, 'ck'> {
    const base = makeBasePayload()
    const items: QrOrderItemV1[] = Array.from({ length: count }, (_, i) => ({
      menuItemId: `item-${i}`,
      menuItemName: `Menu Item Number ${i}`,
      quantity: (i % 3) + 1,
      price: 100 + i * 10,
      subtotal: (100 + i * 10) * ((i % 3) + 1),
      variationSelections: [
        { typeName: 'Size', optionName: 'Large', priceAdjustment: 20 },
      ],
      addons: [{ name: 'Extra Cheese', price: 15, quantity: 1 }],
      specialInstructions: 'no onions please',
    }))
    return {
      ...base,
      items,
      total: items.reduce((sum, it) => sum + it.subtotal, 0),
    }
  }

  it('keeps a typical multi-item order under the warn threshold', () => {
    const encoded = encodeOrderToQr(buildMultiItemPayload(4))
    // Sanity: it still round-trips regardless of size.
    expect(decodeQrToOrder(encoded).ok).toBe(true)
    // A realistic 4-item order should compress under the warn threshold.
    expect(encoded.length).toBeLessThanOrEqual(QR_SIZE_WARN_THRESHOLD)
  })

  it('a very large order exceeds the threshold yet still round-trips (warn, not block)', () => {
    const encoded = encodeOrderToQr(buildMultiItemPayload(20))
    // The threshold is advisory: large payloads still decode correctly so the
    // QR flow can warn (console.warn) without dropping the order.
    expect(encoded.length).toBeGreaterThan(QR_SIZE_WARN_THRESHOLD)
    expect(decodeQrToOrder(encoded).ok).toBe(true)
  })

  it('exposes the documented threshold constant', () => {
    expect(QR_SIZE_WARN_THRESHOLD).toBe(1200)
  })
})
