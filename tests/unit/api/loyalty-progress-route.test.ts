/**
 * @jest-environment node
 */
/**
 * The phone-keyed loyalty read.
 *
 * Unauthenticated by necessity — a diner filling in a checkout form has no
 * account and no tracking token — so the boundary has to earn its safety some
 * other way: the number travels in a POST body rather than a URL, the reply
 * carries a balance and nothing that identifies anybody, and the per-IP limit
 * is tighter than an ordinary read because each call asks about someone else's
 * identifier.
 */

import { POST } from '@/app/api/loyalty/progress/route'
import { NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getPhoneLoyaltyProgress } from '@/lib/loyalty/progress-lookup'
import { readWalletOtpRequired } from '@/lib/loyalty/store-settings'

jest.mock('@/lib/loyalty/progress-lookup', () => ({ getPhoneLoyaltyProgress: jest.fn() }))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ getClientIP: jest.fn(() => '10.0.0.1') }))
jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/loyalty/store-settings', () => ({ readWalletOtpRequired: jest.fn() }))

const ALLOWED = { allowed: true, remaining: 9, retryAfterSec: 60 }

const TENANT = '11111111-1111-4111-8111-111111111111'
const card = { earnedOnOrder: false, programName: 'Coffee Club', earnMode: 'stamp' as const, balance: 5, threshold: 8, rewardsAvailable: 0, rewardLabel: '₱100 off' }
const offer = { programName: 'Coffee Club', earnMode: 'stamp' as const, threshold: 8, rewardLabel: '₱100 off', minSpend: null }

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/loyalty/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(checkRateLimit).mockResolvedValue(ALLOWED)
  jest.mocked(readWalletOtpRequired).mockResolvedValue(false)
  jest.mocked(getPhoneLoyaltyProgress).mockResolvedValue({ ok: true, progress: { offer, card } })
})

it('returns only the card fields the panel renders for the number given', async () => {
  const response = await POST(request({ tenantId: TENANT, phone: '0917 123 4567' }))
  expect(response.status).toBe(200)
  const { earnedOnOrder: _unrendered, ...rendered } = card
  void _unrendered
  expect(await response.json()).toEqual({ success: true, card: rendered })
  expect(getPhoneLoyaltyProgress).toHaveBeenCalledWith({ tenantId: TENANT, phone: '0917 123 4567', outletId: null })
})

it('passes the branch through so a branch programme reads correctly', async () => {
  const outletId = '22222222-2222-4222-8222-222222222222'
  await POST(request({ tenantId: TENANT, phone: '09171234567', outletId }))
  expect(getPhoneLoyaltyProgress).toHaveBeenCalledWith({ tenantId: TENANT, phone: '09171234567', outletId })
})

it('strips anything identifying that a future card shape might carry', async () => {
  const leaky = {
    ...card,
    customerId: 'cust-1',
    customerName: 'Ana Santos',
    phoneE164: '+639171234567',
    rewardSteps: [{ at: 8, label: '₱100 off', emoji: '🎁', imageUrl: null, isFinal: true, customerKey: 'phone:+639171234567' }],
  }
  jest.mocked(getPhoneLoyaltyProgress).mockResolvedValue({ ok: true, progress: { offer, card: leaky } })

  const body = JSON.stringify(await (await POST(request({ tenantId: TENANT, phone: '09171234567' }))).json())

  expect(body).not.toContain('cust-1')
  expect(body).not.toContain('Ana Santos')
  expect(body).not.toContain('9171234567')
  expect(body).toContain('"rewardSteps":[{"at":8,"label":"₱100 off","emoji":"🎁","imageUrl":null,"isFinal":true}]')
})

it('answers a number with no card with nothing at all', async () => {
  jest.mocked(getPhoneLoyaltyProgress).mockResolvedValue({ ok: true, progress: { offer, card: null } })
  expect(await (await POST(request({ tenantId: TENANT, phone: '09171234567' }))).json()).toEqual({ success: true, card: null })
})

it('never echoes the number back to the caller', async () => {
  const response = await POST(request({ tenantId: TENANT, phone: '09171234567' }))
  expect(JSON.stringify(await response.json())).not.toContain('9171234567')
})

it('rejects a malformed body without asking the database anything', async () => {
  expect((await POST(request({ phone: '09171234567' }))).status).toBe(400)
  expect((await POST(request({ tenantId: 'not-a-uuid', phone: '09171234567' }))).status).toBe(400)
  expect((await POST(request({ tenantId: TENANT }))).status).toBe(400)
  expect(getPhoneLoyaltyProgress).not.toHaveBeenCalled()
})

it('answers a number that is not a PH mobile without a lookup result', async () => {
  jest.mocked(getPhoneLoyaltyProgress).mockResolvedValue({ ok: false, error: 'invalid_phone' })
  expect((await POST(request({ tenantId: TENANT, phone: '+1 555 0100' }))).status).toBe(400)
})

it('limits how many numbers one address may ask about, shared across instances', async () => {
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 42 })
  const response = await POST(request({ tenantId: TENANT, phone: '09171234567' }))
  expect(response.status).toBe(429)
  expect(response.headers.get('Retry-After')).toBe('42')
  expect(getPhoneLoyaltyProgress).not.toHaveBeenCalled()
  expect(checkRateLimit).toHaveBeenCalledWith('loyalty-progress:10.0.0.1', { limit: 10, windowSec: 60, onRedisFailure: 'instance' })
})

it('keeps a limit through a Redis outage instead of opening up', async () => {
  await POST(request({ tenantId: TENANT, phone: '09171234567' }))
  expect(jest.mocked(checkRateLimit).mock.calls[0][1]).toMatchObject({ onRedisFailure: 'instance' })
})

it('reports a failed read instead of an empty card', async () => {
  jest.mocked(getPhoneLoyaltyProgress).mockResolvedValue({ ok: false, error: 'unavailable' })
  expect((await POST(request({ tenantId: TENANT, phone: '09171234567' }))).status).toBe(503)
})

describe('stores that require a verified number', () => {
  it('shows no card to a typed number, without reading the balance', async () => {
    jest.mocked(readWalletOtpRequired).mockResolvedValue(true)
    const response = await POST(request({ tenantId: TENANT, phone: '09171234567' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, card: null })
    expect(getPhoneLoyaltyProgress).not.toHaveBeenCalled()
  })

  it('hides the card when the setting cannot be read', async () => {
    jest.mocked(readWalletOtpRequired).mockRejectedValue(new Error('down'))
    const response = await POST(request({ tenantId: TENANT, phone: '09171234567' }))
    expect(await response.json()).toEqual({ success: true, card: null })
    expect(getPhoneLoyaltyProgress).not.toHaveBeenCalled()
  })
})
