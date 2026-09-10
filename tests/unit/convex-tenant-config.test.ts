/**
 * The tenant's Convex deployment learns about Lalamove only through the
 * `tenantConfig` rows this payload writes. A key that is missing from the
 * payload leaves whatever Convex already had — which is how a store whose
 * superadmin record holds live production keys still books against a stale
 * `admin123` placeholder, or reports "Lalamove not configured" because an
 * older sync left the secret key empty.
 */
import {
  buildTenantConfigPayload,
  type ConvexTenantConfigSource,
} from '@/lib/convex-tenant-config'

const configuredTenant: ConvexTenantConfigSource = {
  name: 'Foodify',
  lalamove_enabled: true,
  lalamove_api_key: 'pk_prod_key',
  lalamove_secret_key: 'sk_prod_secret',
  lalamove_market: 'PH',
  lalamove_service_type: 'MOTORCYCLE',
  lalamove_sandbox: false,
  lalamove_sender_phone: '09053097280',
  footer_phone: '09170000000',
  footer_whatsapp: '',
  restaurant_address: 'Pasay, Metro Manila',
  restaurant_latitude: '14.53615148',
  restaurant_longitude: '121.00351672',
}

describe('buildTenantConfigPayload', () => {
  test('carries the Lalamove credentials and market settings', () => {
    // Arrange / Act
    const payload = buildTenantConfigPayload(configuredTenant)

    // Assert
    expect(payload).toMatchObject({
      lalamove_api_key: 'pk_prod_key',
      lalamove_secret_key: 'sk_prod_secret',
      lalamove_market: 'PH',
      lalamove_service_type: 'MOTORCYCLE',
      lalamove_sandbox: 'false',
      lalamove_sender_phone: '09053097280',
    })
  })

  test('carries the pickup address and coordinates', () => {
    const payload = buildTenantConfigPayload(configuredTenant)

    expect(payload).toMatchObject({
      restaurant_name: 'Foodify',
      restaurant_address: 'Pasay, Metro Manila',
      restaurant_latitude: '14.53615148',
      restaurant_longitude: '121.00351672',
    })
  })

  test('overwrites a stale key when the tenant has no key stored', () => {
    // A tenant whose secrets row is empty must not keep booking with whatever
    // placeholder an earlier deploy pushed.
    const payload = buildTenantConfigPayload({
      ...configuredTenant,
      lalamove_api_key: null,
      lalamove_secret_key: null,
    })

    expect(payload.lalamove_api_key).toBe('')
    expect(payload.lalamove_secret_key).toBe('')
  })

  test('clears the credentials when Lalamove is switched off', () => {
    const payload = buildTenantConfigPayload({
      ...configuredTenant,
      lalamove_enabled: false,
    })

    expect(payload.lalamove_api_key).toBe('')
    expect(payload.lalamove_secret_key).toBe('')
  })

  test('falls back to the footer numbers for the pickup phone', () => {
    const payload = buildTenantConfigPayload({
      ...configuredTenant,
      lalamove_sender_phone: '',
    })

    expect(payload.lalamove_sender_phone).toBe('09170000000')
  })

  test('falls back to WhatsApp when no other store number is set', () => {
    const payload = buildTenantConfigPayload({
      ...configuredTenant,
      lalamove_sender_phone: null,
      footer_phone: '',
      footer_whatsapp: '09181111111',
    })

    expect(payload.lalamove_sender_phone).toBe('09181111111')
  })

  test('clears an address that was removed rather than leaving the old one', () => {
    const payload = buildTenantConfigPayload({
      ...configuredTenant,
      restaurant_address: null,
      restaurant_latitude: null,
      restaurant_longitude: null,
    })

    expect(payload.restaurant_address).toBe('')
    expect(payload.restaurant_latitude).toBe('')
    expect(payload.restaurant_longitude).toBe('')
  })

  test('defaults the market and service type Convex reads', () => {
    const payload = buildTenantConfigPayload({
      ...configuredTenant,
      lalamove_market: null,
      lalamove_service_type: null,
      lalamove_sandbox: null,
    })

    expect(payload.lalamove_market).toBe('PH')
    expect(payload.lalamove_service_type).toBe('MOTORCYCLE')
    expect(payload.lalamove_sandbox).toBe('false')
  })

  test('every value is a string, because Convex config rows are strings', () => {
    const payload = buildTenantConfigPayload(configuredTenant)

    for (const value of Object.values(payload)) {
      expect(typeof value).toBe('string')
    }
  })
})

describe('merchant gate rows (template v28)', () => {
  test('pins the deployment to its tenant and carries the rollout switches', () => {
    // Arrange / Act
    const payload = buildTenantConfigPayload({
      ...configuredTenant,
      id: 'tenant-uuid',
      convex_auth_enforced: true,
      convex_public_reads: false,
    })

    // Assert — strings, because tenantConfig.value is a string column.
    expect(payload).toMatchObject({
      tenant_id: 'tenant-uuid',
      auth_enforced: 'true',
      public_reads: 'false',
    })
  })

  test('an unflagged store syncs as not enforced, and an unpinned one as empty', () => {
    // A deployment that receives '' for tenant_id refuses every non-superadmin
    // caller once enforced — fail closed, never "any tenant".
    const payload = buildTenantConfigPayload(configuredTenant)
    expect(payload).toMatchObject({ tenant_id: '', auth_enforced: 'false', public_reads: 'false' })
  })
})
