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
import { checkRateLimit } from '@/lib/rate-limit'
import { getPhoneLoyaltyProgress } from '@/lib/loyalty/progress-lookup'

jest.mock('@/lib/loyalty/progress-lookup', () => ({ getPhoneLoyaltyProgress: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true })),
  getClientIP: jest.fn(() => '10.0.0.1'),
}))

const TENANT = '11111111-1111-4111-8111-111111111111'
const card = { earnedOnOrder: false, programName: 'Coffee Club', earnMode: 'stamp', balance: 5, threshold: 8, rewardsAvailable: 0, rewardLabel: '₱100 off' }
const offer = { programName: 'Coffee Club', earnMode: 'stamp', threshold: 8, rewardLabel: '₱100 off', minSpend: null }

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/loyalty/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(checkRateLimit).mockReturnValue({ allowed: true } as ReturnType<typeof checkRateLimit>)
  jest.mocked(getPhoneLoyaltyProgress).mockResolvedValue({ ok: true, progress: { offer, card } })
})

it('returns the offer and the card for the number given', async () => {
  const response = await POST(request({ tenantId: TENANT, phone: '0917 123 4567' }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, offer, card })
  expect(getPhoneLoyaltyProgress).toHaveBeenCalledWith({ tenantId: TENANT, phone: '0917 123 4567', outletId: null })
})

it('passes the branch through so a branch programme reads correctly', async () => {
  const outletId = '22222222-2222-4222-8222-222222222222'
  await POST(request({ tenantId: TENANT, phone: '09171234567', outletId }))
  expect(getPhoneLoyaltyProgress).toHaveBeenCalledWith({ tenantId: TENANT, phone: '09171234567', outletId })
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

it('limits how many numbers one address may ask about', async () => {
  jest.mocked(checkRateLimit).mockReturnValue({ allowed: false } as ReturnType<typeof checkRateLimit>)
  const response = await POST(request({ tenantId: TENANT, phone: '09171234567' }))
  expect(response.status).toBe(429)
  expect(getPhoneLoyaltyProgress).not.toHaveBeenCalled()
  expect(jest.mocked(checkRateLimit).mock.calls[0][1]).toMatchObject({ maxRequests: 10 })
})

it('reports a failed read instead of an empty card', async () => {
  jest.mocked(getPhoneLoyaltyProgress).mockResolvedValue({ ok: false, error: 'unavailable' })
  expect((await POST(request({ tenantId: TENANT, phone: '09171234567' }))).status).toBe(503)
})
