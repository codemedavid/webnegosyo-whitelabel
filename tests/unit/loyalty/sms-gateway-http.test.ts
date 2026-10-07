/** @jest-environment node */
/**
 * Merchant-facing gateway endpoints: the settings card (is a phone online?
 * is a Semaphore key on file?) and the store-branded SMS text handed to a
 * gateway phone with its grant.
 *
 * Modules under test are imported inside each test (next/jest does not hoist
 * jest.mock above static imports).
 */
import { NextRequest } from 'next/server'

const TENANT = '11111111-1111-1111-1111-111111111111'
const DEVICE = '33333333-3333-3333-3333-333333333333'
const JOB = '44444444-4444-4444-4444-444444444444'
const LEASE = '55555555-5555-5555-5555-555555555555'
const KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
const CREDENTIAL = 'A'.repeat(43)

const owner = { role: 'admin', is_owner: true, permissions: null, tenant_id: TENANT }
const staff = { role: 'admin', is_owner: false, permissions: ['loyalty_manage'], tenant_id: TENANT }
const outsider = { role: 'admin', is_owner: false, permissions: ['orders'], tenant_id: TENANT }
let member: Record<string, unknown> = owner

const rpc = jest.fn()
const storeSettings = { data: null as { wallet_otp_required: boolean } | null, error: null as unknown }
const upsert = jest.fn<Promise<{ error: unknown }>, [unknown, unknown]>(async () => ({ error: null }))
const admin = {
  rpc,
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => (table === 'loyalty_store_settings' ? storeSettings : { data: { name: 'Cafe' }, error: null }) }) }),
    upsert,
  }),
}

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
jest.mock('@/lib/loyalty/merchant-http', () => ({
  ...jest.requireActual('@/lib/loyalty/merchant-http'),
  authenticateMerchant: jest.fn(async () => ({ ok: true, userId: 'user-1', member })),
}))
jest.mock('@/lib/tenant-secrets', () => ({ getLoyaltySmsFallback: jest.fn(), setLoyaltySmsFallback: jest.fn() }))
jest.mock('@/lib/loyalty/semaphore', () => ({ ...jest.requireActual('@/lib/loyalty/semaphore'), verifySemaphoreKey: jest.fn() }))
jest.mock('@/lib/loyalty/sms-dispatch', () => ({ authorizeLoyaltySmsDispatch: jest.fn() }))
jest.mock('@/lib/loyalty/server-keys', () => ({ loadLoyaltyClaimCrypto: () => ({}) }))

function post(path: string, body: unknown) {
  return new NextRequest(`https://store.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  })
}

async function load() {
  const settings = await import('@/lib/loyalty/sms-settings-http')
  const delivery = await import('@/lib/loyalty/sms-delivery-http')
  const secrets = await import('@/lib/tenant-secrets')
  const semaphore = await import('@/lib/loyalty/semaphore')
  const dispatch = await import('@/lib/loyalty/sms-dispatch')
  return {
    settings: settings.handleSmsGatewaySettings,
    delivery: delivery.handleSmsDelivery,
    readFallback: secrets.getLoyaltySmsFallback as jest.Mock,
    saveFallback: secrets.setLoyaltySmsFallback as jest.Mock,
    verifyKey: semaphore.verifySemaphoreKey as jest.Mock,
    authorize: dispatch.authorizeLoyaltySmsDispatch as jest.Mock,
  }
}

beforeEach(() => {
  process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'true'
  member = owner
  storeSettings.data = null
  storeSettings.error = null
  jest.clearAllMocks()
  rpc.mockResolvedValue({ data: { ok: true, gatewayOnline: true, lastSeenAt: '2026-10-04T01:00:00Z' }, error: null })
})

describe('sms settings: status', () => {
  test('reports phone presence and whether a fallback exists, never the key itself', async () => {
    const { settings, readFallback } = await load()
    readFallback.mockResolvedValue({ apiKey: KEY, senderName: 'CAFE' })

    const response = await settings(post('/api/loyalty/sms-settings', { tenantId: TENANT, action: 'status' }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      gatewayOnline: true,
      lastSeenAt: '2026-10-04T01:00:00Z',
      fallback: { configured: true, senderName: 'CAFE' },
      walletVerification: false,
    })
    expect(JSON.stringify(body)).not.toContain(KEY)
  })

  test('loyalty staff may read status; staff without loyalty access may not', async () => {
    const { settings, readFallback } = await load()
    readFallback.mockResolvedValue(null)
    member = staff
    expect((await settings(post('/x', { tenantId: TENANT, action: 'status' }))).status).toBe(200)
    member = outsider
    expect((await settings(post('/x', { tenantId: TENANT, action: 'status' }))).status).toBe(403)
  })

  test('is closed while the SMS release flag is off', async () => {
    const { settings } = await load()
    process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'false'
    expect((await settings(post('/x', { tenantId: TENANT, action: 'status' }))).status).toBe(503)
  })
})

describe('sms settings: Semaphore fallback', () => {
  test('saves a key Semaphore accepts', async () => {
    const { settings, verifyKey, saveFallback } = await load()
    verifyKey.mockResolvedValue({ ok: true })

    const response = await settings(post('/x', { tenantId: TENANT, action: 'save_fallback', apiKey: KEY, senderName: 'CAFE' }))

    expect(response.status).toBe(200)
    expect(saveFallback).toHaveBeenCalledWith(admin, TENANT, { apiKey: KEY, senderName: 'CAFE' })
  })

  test('refuses a key Semaphore rejects, and says the outage apart from the typo', async () => {
    const { settings, verifyKey, saveFallback } = await load()
    verifyKey.mockResolvedValue({ ok: false, reason: 'invalid_key' })
    const rejected = await settings(post('/x', { tenantId: TENANT, action: 'save_fallback', apiKey: KEY, senderName: null }))
    expect(rejected.status).toBe(400)
    expect((await rejected.json()).error).toMatch(/did not accept/i)
    verifyKey.mockResolvedValue({ ok: false, reason: 'unreachable' })
    expect((await settings(post('/x', { tenantId: TENANT, action: 'save_fallback', apiKey: KEY, senderName: null }))).status).toBe(503)
    expect(saveFallback).not.toHaveBeenCalled()
  })

  test('validates shapes before calling Semaphore', async () => {
    const { settings, verifyKey } = await load()
    for (const body of [
      { tenantId: TENANT, action: 'save_fallback', apiKey: 'nope', senderName: null },
      { tenantId: TENANT, action: 'save_fallback', apiKey: KEY, senderName: 'WAY TOO LONG NAME' },
      { tenantId: TENANT, action: 'save_fallback', apiKey: KEY },
      { tenantId: TENANT, action: 'bogus' },
    ]) {
      expect((await settings(post('/x', body))).status).toBe(400)
    }
    expect(verifyKey).not.toHaveBeenCalled()
  })

  test('only the owner may change or remove the fallback', async () => {
    const { settings, saveFallback } = await load()
    member = staff
    expect((await settings(post('/x', { tenantId: TENANT, action: 'clear_fallback' }))).status).toBe(403)
    member = owner
    expect((await settings(post('/x', { tenantId: TENANT, action: 'clear_fallback' }))).status).toBe(200)
    expect(saveFallback).toHaveBeenCalledWith(admin, TENANT, null)
  })
})

describe('gateway authorize grant', () => {
  test('carries the store-branded SMS text so the phone and Semaphore say the same thing', async () => {
    const { delivery, authorize } = await load()
    member = staff
    authorize.mockResolvedValue({ ok: true, jobId: JOB, leaseToken: LEASE, phone: '+639171234567', code: '012345', expiresAt: '2026-10-04T01:05:00Z' })

    const response = await delivery(
      post('/api/loyalty/sms-delivery/authorize', { tenantId: TENANT, deviceId: DEVICE, credential: CREDENTIAL, jobId: JOB, leaseToken: LEASE }),
      'authorize',
    )

    expect(response.status).toBe(200)
    expect((await response.json()).grant).toEqual({
      jobId: JOB,
      leaseToken: LEASE,
      phone: '+639171234567',
      code: '012345',
      expiresAt: '2026-10-04T01:05:00Z',
      message: '012345 is your Cafe reward code. It expires in 5 minutes. Never share it with anyone.',
    })
  })
})

describe('sms settings: verify before showing rewards', () => {
  test('status reports the switch', async () => {
    const { settings, readFallback } = await load()
    readFallback.mockResolvedValue(null)
    storeSettings.data = { wallet_otp_required: true }
    const body = await (await settings(post('/x', { tenantId: TENANT, action: 'status' }))).json()
    expect(body.walletVerification).toBe(true)
  })

  test('loyalty staff can turn it on and off; others cannot', async () => {
    const { settings } = await load()
    member = staff
    const on = await settings(post('/x', { tenantId: TENANT, action: 'set_wallet_verification', enabled: true }))
    expect(on.status).toBe(200)
    expect(await on.json()).toEqual({ success: true, walletVerification: true })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: TENANT, wallet_otp_required: true }),
      { onConflict: 'tenant_id' },
    )
    member = outsider
    expect((await settings(post('/x', { tenantId: TENANT, action: 'set_wallet_verification', enabled: false }))).status).toBe(403)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  test('only a real boolean is accepted', async () => {
    const { settings } = await load()
    for (const enabled of ['true', 1, null, undefined]) {
      expect((await settings(post('/x', { tenantId: TENANT, action: 'set_wallet_verification', enabled }))).status).toBe(400)
    }
    expect(upsert).not.toHaveBeenCalled()
  })

  test('a failed save is reported, not swallowed', async () => {
    const { settings } = await load()
    upsert.mockResolvedValueOnce({ error: { message: 'down' } })
    expect((await settings(post('/x', { tenantId: TENANT, action: 'set_wallet_verification', enabled: true }))).status).toBe(503)
  })
})
