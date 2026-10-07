/**
 * Which backend a merchant-app capture is filed under — decided by the tenant,
 * never by the register's claim.
 *
 * Background: the QR scanner hard-coded `backend: "convex"` on every capture,
 * even for stores whose orders the app writes to the platform Supabase. The
 * route took the claim at face value, so a platform store's scanned order went
 * into the `customer_external_orders` ledger instead of being linked by
 * `orders.customer_id`: the order vanished from the guest's history, the
 * profile was recomputed from the ledger alone (a regular's lifetime totals
 * restated as one order), and the ledger's loyalty trigger queued a `convex`
 * earning job the worker can never resolve for a platform store.
 */

import { describe, test, expect } from '@jest/globals'

async function load() {
  return import('@/lib/customers/capture-backend')
}

describe('captureBackendOf', () => {
  test('names each resolved order backend in the capture vocabulary', async () => {
    // Arrange
    const { captureBackendOf } = await load()

    // Act + Assert
    expect(captureBackendOf({ order_backend: 'platform' })).toBe('platform')
    expect(captureBackendOf({ order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' })).toBe('convex')
    expect(captureBackendOf({ order_backend: 'supabase' })).toBe('tenant_supabase')
  })

  test('derives an unpinned tenant from its credentials, as checkout does', async () => {
    const { captureBackendOf } = await load()

    expect(captureBackendOf({ order_backend: 'auto', convex_deployment_url: 'https://x.convex.cloud' })).toBe('convex')
    expect(captureBackendOf({ order_backend: null, convex_deployment_url: null })).toBe('platform')
  })
})

describe('reconcileCaptureBackend', () => {
  test('accepts a claim that matches the tenant', async () => {
    const { reconcileCaptureBackend } = await load()

    expect(reconcileCaptureBackend('convex', 'convex')).toEqual({
      ok: true,
      backend: 'convex',
      corrected: false,
    })
    expect(reconcileCaptureBackend('platform', 'platform')).toEqual({
      ok: true,
      backend: 'platform',
      corrected: false,
    })
  })

  test('files a platform store’s capture as platform whatever the register claimed', async () => {
    // Every app build before the fix sends `convex` from the scanner. The order
    // is verified against the tenant's own orders table before linking, so
    // correcting is safe — and fixes those installs without a store release.
    const { reconcileCaptureBackend } = await load()

    expect(reconcileCaptureBackend('convex', 'platform')).toEqual({
      ok: true,
      backend: 'platform',
      corrected: true,
    })
    expect(reconcileCaptureBackend('tenant_supabase', 'platform')).toEqual({
      ok: true,
      backend: 'platform',
      corrected: true,
    })
  })

  test('refuses a claim it cannot verify against a foreign backend', async () => {
    // A ledger row is keyed by (tenant, backend, order id): filing under the
    // wrong foreign backend would count the same order twice once it arrives
    // under its real one. The platform cannot read Convex or a tenant project,
    // so a mismatch there is refused, not guessed at.
    const { reconcileCaptureBackend } = await load()

    expect(reconcileCaptureBackend('platform', 'convex').ok).toBe(false)
    expect(reconcileCaptureBackend('convex', 'tenant_supabase').ok).toBe(false)
    expect(reconcileCaptureBackend('tenant_supabase', 'convex').ok).toBe(false)
  })
})

describe('isPlatformOrderId', () => {
  test('accepts only uuids, the platform orders table’s key', async () => {
    const { isPlatformOrderId } = await load()

    expect(isPlatformOrderId('7d1c3a2e-5b4f-4c8d-9e0a-1b2c3d4e5f60')).toBe(true)
    // A Convex document id would 22P02 the uuid column instead of not matching.
    expect(isPlatformOrderId('jh7dm2p8qr3n5x9k4tw2vc6y8b')).toBe(false)
    expect(isPlatformOrderId('')).toBe(false)
  })
})
