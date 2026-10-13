/** @jest-environment node */
/**
 * The sending phone's door to automated texts. The SQL owns every rule; this
 * layer must: refuse malformed bodies, hash the credential (never pass it
 * raw), turn `request_denied` into 403 (the phone then knows it is revoked),
 * pass "wait" answers through with their retry time, and never forward a
 * claim whose body or phone looks wrong.
 */

import { NextRequest } from 'next/server'

const authenticateMerchant = jest.fn()
const rpc = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: (...args: unknown[]) => rpc(...args) }) }))
jest.mock('@/lib/loyalty/merchant-http', () => {
  const actual = jest.requireActual('@/lib/loyalty/merchant-http')
  return { ...actual, authenticateMerchant: (...args: unknown[]) => authenticateMerchant(...args) }
})

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const DEVICE = '1f6e1c3a-8a0e-4c62-9a53-4c3c0f1e2d11'
const MESSAGE = '2f6e1c3a-8a0e-4c62-9a53-4c3c0f1e2d12'
const LEASE = '3f6e1c3a-8a0e-4c62-9a53-4c3c0f1e2d13'
const CREDENTIAL = 'a'.repeat(43)

function post(body: unknown) {
  return new NextRequest('https://example.com/api/sms/outbox/claim', {
    method: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer t' },
  })
}

async function call(action: string, body: unknown) {
  const { handleOutboxDelivery } = await import('@/lib/sms-automations/api/device-http')
  const response = await handleOutboxDelivery(post(body), action)
  return { status: response.status, json: await response.json() }
}

const identity = { tenantId: TENANT, deviceId: DEVICE, credential: CREDENTIAL }

beforeEach(() => {
  jest.clearAllMocks()
  process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'true'
  authenticateMerchant.mockResolvedValue({ ok: true, userId: 'u1', member: { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: null } })
})

describe('outbox claim', () => {
  it('hands the phone one text', async () => {
    rpc.mockResolvedValue({ data: { ok: true, messageId: MESSAGE, leaseToken: LEASE, phone: '+639171234567', body: 'Hi Ana' }, error: null })
    const { status, json } = await call('claim', identity)
    expect(status).toBe(200)
    expect(json).toEqual({ message: { messageId: MESSAGE, leaseToken: LEASE, phone: '+639171234567', body: 'Hi Ana' }, wait: null })
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('claim_sms_outbox_message')
    expect(args.p_credential_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(args)).not.toContain(CREDENTIAL)
  })

  it('passes a wait (quiet hours, pacing, daily limit, nothing due) through', async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: 'paced', retryAt: '2026-10-13T05:34:14Z' }, error: null })
    expect((await call('claim', identity)).json).toEqual({ message: null, wait: { reason: 'paced', retryAt: '2026-10-13T05:34:14Z' } })
    rpc.mockResolvedValue({ data: { ok: false, error: 'no_job', nextAt: null }, error: null })
    expect((await call('claim', identity)).json).toEqual({ message: null, wait: { reason: 'no_job', retryAt: null } })
  })

  it('is 403 when the database no longer accepts this phone', async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: 'request_denied' }, error: null })
    expect((await call('claim', identity)).status).toBe(403)
  })

  it('refuses staff without customers before touching the database', async () => {
    authenticateMerchant.mockResolvedValue({ ok: true, userId: 'u1', member: { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['orders'] } })
    expect((await call('claim', identity)).status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never forwards a claim that looks wrong', async () => {
    rpc.mockResolvedValue({ data: { ok: true, messageId: MESSAGE, leaseToken: LEASE, phone: '09171234567', body: 'Hi' }, error: null })
    expect((await call('claim', identity)).status).toBe(503)
  })

  it('refuses malformed bodies and is off when the release flag is off', async () => {
    expect((await call('claim', { ...identity, extra: 1 })).status).toBe(400)
    expect((await call('claim', { ...identity, credential: 'short' })).status).toBe(400)
    expect((await call('dance', identity)).status).toBe(404)
    process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'false'
    expect((await call('claim', identity)).status).toBe(503)
  })
})

describe('outbox finish', () => {
  it('reports the outcome with a short error code', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    const { json } = await call('finish', { ...identity, messageId: MESSAGE, leaseToken: LEASE, outcome: 'failed', error: 'radio_off' })
    expect(json).toEqual({ applied: true })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_message_id: MESSAGE, p_lease_token: LEASE, p_outcome: 'failed', p_error: 'radio_off' })
  })

  it('refuses a free-text error', async () => {
    expect((await call('finish', { ...identity, messageId: MESSAGE, leaseToken: LEASE, outcome: 'failed', error: 'Phone said: <b>' })).status).toBe(400)
  })
})
