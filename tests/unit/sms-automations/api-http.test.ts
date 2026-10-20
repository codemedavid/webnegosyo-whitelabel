/** @jest-environment node */
/**
 * The automations route's door: a bad body never reaches auth, a member
 * without `customers` or a branch-locked account is refused, and a valid
 * request reaches exactly one handler with the tenant lower-cased.
 */

import { NextRequest } from 'next/server'

const authenticateMerchant = jest.fn()
const listAutomationsView = jest.fn()
const saveAutomation = jest.fn()
const writeMessages = jest.fn()
const checkRateLimit = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ fake: true }) }))
jest.mock('@/lib/loyalty/merchant-http', () => {
  const actual = jest.requireActual('@/lib/loyalty/merchant-http')
  return { ...actual, authenticateMerchant: (...args: unknown[]) => authenticateMerchant(...args) }
})
jest.mock('@/lib/sms-automations/api/reads', () => ({
  listAutomationsView: (...args: unknown[]) => listAutomationsView(...args),
  listActivity: jest.fn(),
}))
jest.mock('@/lib/sms-automations/api/writes', () => ({
  saveAutomation: (...args: unknown[]) => saveAutomation(...args),
  cancelWaiting: jest.fn(), previewAutomation: jest.fn(), runAutomationNow: jest.fn(),
  saveSettings: jest.fn(), setAutomationStatus: jest.fn(),
  writeMessages: (...args: unknown[]) => writeMessages(...args),
}))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => checkRateLimit(...args) }))

const TENANT = '0DD96B60-5232-4C79-922B-0BD9022D12BA'

function post(body: unknown) {
  return new NextRequest('https://example.com/api/sms/automations', {
    method: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
  })
}

function member(overrides: Record<string, unknown> = {}) {
  return { ok: true, userId: 'u1', member: { role: 'admin', tenant_id: TENANT.toLowerCase(), is_owner: false, permissions: ['customers'], outlet_id: null, ...overrides } }
}

async function handle(body: unknown) {
  const { handleSmsAutomations } = await import('@/lib/sms-automations/api/http')
  return handleSmsAutomations(post(body))
}

beforeEach(() => {
  jest.clearAllMocks()
  listAutomationsView.mockResolvedValue({ automations: [] })
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 5, retryAfterSec: 0 })
})

describe('POST /api/sms/automations', () => {
  it('refuses an invalid body before authenticating', async () => {
    const response = await handle({ action: 'list', tenantId: 'shop' })
    expect(response.status).toBe(400)
    expect(authenticateMerchant).not.toHaveBeenCalled()
  })

  it('refuses staff without the customers permission', async () => {
    authenticateMerchant.mockResolvedValue(member({ permissions: ['orders'] }))
    expect((await handle({ action: 'list', tenantId: TENANT })).status).toBe(403)
    expect(listAutomationsView).not.toHaveBeenCalled()
  })

  it('refuses branch-locked accounts', async () => {
    authenticateMerchant.mockResolvedValue(member({ outlet_id: 'b1' }))
    expect((await handle({ action: 'list', tenantId: TENANT })).status).toBe(403)
  })

  it('lists for a member with customers, tenant lower-cased', async () => {
    authenticateMerchant.mockResolvedValue(member())
    const response = await handle({ action: 'list', tenantId: TENANT })
    expect(response.status).toBe(200)
    expect(authenticateMerchant.mock.calls[0][1]).toBe(TENANT.toLowerCase())
    expect(listAutomationsView.mock.calls[0][1]).toBe(TENANT.toLowerCase())
  })

  it('refuses a message the recipe cannot fill without touching the database', async () => {
    authenticateMerchant.mockResolvedValue(member())
    const response = await handle({ action: 'save', tenantId: TENANT, automation: { recipe: 'win_back', messageTemplate: 'Your {{rewardName}}' } })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'invalid_message' })
    expect(saveAutomation).not.toHaveBeenCalled()
  })

  it('turns a handler failure into a 503 without leaking it', async () => {
    authenticateMerchant.mockResolvedValue(member())
    listAutomationsView.mockRejectedValue(new Error('relation "secret" does not exist'))
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const response = await handle({ action: 'list', tenantId: TENANT })
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('secret')
    errorSpy.mockRestore()
  })

  describe('"Write it for me" is metered like the web: shared across instances, per person AND per store per day', () => {
    const write = { action: 'write', tenantId: TENANT, recipe: 'win_back', language: 'en' }

    it('checks the shared per-person and per-store-day limits, refusing while the limiter is down', async () => {
      authenticateMerchant.mockResolvedValue(member())
      writeMessages.mockResolvedValue({ ok: true, value: { messages: ['Hi'] } })
      expect((await handle(write)).status).toBe(200)
      const keys = checkRateLimit.mock.calls.map(([key]) => key)
      expect(keys).toEqual([`texts-write:u1`, `texts-write-day:${TENANT.toLowerCase()}`])
      expect(checkRateLimit.mock.calls.every(([, options]) => options.onRedisFailure === 'refuse')).toBe(true)
    })

    it('never calls the model once the store used its daily drafts', async () => {
      authenticateMerchant.mockResolvedValue(member())
      checkRateLimit.mockImplementation(async (key: string) => ({ allowed: !key.startsWith('texts-write-day:'), remaining: 0, retryAfterSec: 60 }))
      const response = await handle(write)
      expect(response.status).toBe(429)
      expect(writeMessages).not.toHaveBeenCalled()
    })
  })

  it('meters whole-store reads (preview, run now, switching) with the shared preview limit', async () => {
    authenticateMerchant.mockResolvedValue(member())
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 60 })
    const response = await handle({ action: 'run_now', tenantId: TENANT, automationId: '6f1c2b8e-1d2a-4f3b-9c4d-5e6f7a8b9c0d' })
    expect(response.status).toBe(429)
    expect(checkRateLimit.mock.calls[0][0]).toBe('texts-preview:u1')
  })

  it('does not meter a plain list', async () => {
    authenticateMerchant.mockResolvedValue(member())
    await handle({ action: 'list', tenantId: TENANT })
    expect(checkRateLimit).not.toHaveBeenCalled()
  })
})
