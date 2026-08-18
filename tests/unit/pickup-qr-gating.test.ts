/**
 * Which orders show a pickup QR, and how the pickup kind is resolved.
 *
 * `orders.order_type` is a SNAPSHOT string, written at checkout as
 * `selectedOrderType?.type ?? selectedOrderType?.name ?? ''` — so it usually
 * holds the enum ('pickup') but falls back to a merchant-editable label when
 * the order type row has no type. Matching that string alone would show the
 * QR on a type someone renamed to "Pick Up" and hide it on one renamed to
 * "Takeaway". The order's `order_type_id` FK is the authority.
 */

import {
  isPickupScanEnabled,
  resolveOrderTypeKind,
  shouldShowPickupQr,
} from '@/lib/pickup-qr-gating'

describe('resolveOrderTypeKind', () => {
  it('prefers the joined order_types.type over the snapshot string', () => {
    // Arrange: the merchant renamed the type, so the snapshot is a label.
    const kind = resolveOrderTypeKind({
      orderTypeFromRow: 'pickup',
      orderTypeSnapshot: 'Takeaway Counter',
    })

    // Assert
    expect(kind).toBe('pickup')
  })

  it('falls back to the snapshot string when the row is unavailable', () => {
    // Orders predating the FK, or a deleted order type, leave only the snapshot.
    const kind = resolveOrderTypeKind({
      orderTypeFromRow: null,
      orderTypeSnapshot: 'pickup',
    })

    expect(kind).toBe('pickup')
  })

  it('normalizes case and separators in the snapshot fallback', () => {
    expect(
      resolveOrderTypeKind({ orderTypeFromRow: null, orderTypeSnapshot: 'Dine In' })
    ).toBe('dine_in')
    expect(
      resolveOrderTypeKind({ orderTypeFromRow: null, orderTypeSnapshot: 'DINE-IN' })
    ).toBe('dine_in')
  })

  it('returns null for a renamed label it cannot map, rather than guessing', () => {
    // A wrong guess here either hides the QR from a pickup customer or shows
    // it to a delivery one. Unknown must stay unknown.
    const kind = resolveOrderTypeKind({
      orderTypeFromRow: null,
      orderTypeSnapshot: 'Takeaway Counter',
    })

    expect(kind).toBeNull()
  })

  it('returns null when nothing identifies the order type', () => {
    expect(
      resolveOrderTypeKind({ orderTypeFromRow: null, orderTypeSnapshot: '' })
    ).toBeNull()
  })
})

describe('shouldShowPickupQr', () => {
  it('shows the QR for a pickup order that is being prepared', () => {
    expect(
      shouldShowPickupQr({ kind: 'pickup', status: 'preparing', isScanEnabled: true })
    ).toBe(true)
  })

  it('shows the QR for a pickup order that is ready', () => {
    expect(
      shouldShowPickupQr({ kind: 'pickup', status: 'ready', isScanEnabled: true })
    ).toBe(true)
  })

  it('hides the QR once the order has been handed over', () => {
    expect(
      shouldShowPickupQr({ kind: 'pickup', status: 'delivered', isScanEnabled: true })
    ).toBe(false)
  })

  it('hides the QR for a cancelled order', () => {
    expect(
      shouldShowPickupQr({ kind: 'pickup', status: 'cancelled', isScanEnabled: true })
    ).toBe(false)
  })

  it('hides the QR for delivery and dine-in orders', () => {
    expect(
      shouldShowPickupQr({ kind: 'delivery', status: 'ready', isScanEnabled: true })
    ).toBe(false)
    expect(
      shouldShowPickupQr({ kind: 'dine_in', status: 'ready', isScanEnabled: true })
    ).toBe(false)
  })

  it('hides the QR when the order type could not be resolved', () => {
    // Fail closed: showing a scannable code on a delivery order invites a
    // courier to confirm a pickup that never happened.
    expect(
      shouldShowPickupQr({ kind: null, status: 'ready', isScanEnabled: true })
    ).toBe(false)
  })

  it('hides the QR at every live status when the store turned scanning off', () => {
    // The admin switch has to beat the order's own state, otherwise a store
    // that disabled the feature still hands out codes on in-flight orders.
    for (const status of ['pending', 'confirmed', 'preparing', 'ready']) {
      expect(
        shouldShowPickupQr({ kind: 'pickup', status, isScanEnabled: false })
      ).toBe(false)
    }
  })
})

describe('isPickupScanEnabled', () => {
  it('treats an explicit false as off', () => {
    expect(isPickupScanEnabled(false)).toBe(false)
  })

  it('treats an explicit true as on', () => {
    expect(isPickupScanEnabled(true)).toBe(true)
  })

  it('treats a missing value as on, matching the column default', () => {
    // Old app builds, an unapplied migration, and a cached tracking payload
    // all produce undefined/null here. None of them mean "disabled" — the
    // column defaults to true, so absence must read as today's behaviour.
    expect(isPickupScanEnabled(undefined)).toBe(true)
    expect(isPickupScanEnabled(null)).toBe(true)
  })
})
