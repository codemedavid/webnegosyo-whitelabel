/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import { GET } from '@/app/api/loyalty/activity/route'
import { authorizeLoyaltyMerchant } from '@/lib/loyalty/merchant-auth'
import { readLoyaltyActivity } from '@/lib/loyalty/activity-repository'

jest.mock('@/lib/loyalty/merchant-auth', () => ({ authorizeLoyaltyMerchant: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/loyalty/activity-repository', () => ({ readLoyaltyActivity: jest.fn() }))
const tenant = '11111111-1111-4111-8111-111111111111'
const request = (query = '') => new NextRequest(`https://shop.test/api/loyalty/activity?tenantId=${tenant}${query}`)
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(authorizeLoyaltyMerchant).mockResolvedValue({ userId: 'actor', tenantId: tenant })
  jest.mocked(readLoyaltyActivity).mockResolvedValue({ events: [], nextCursor: null })
})
it('requires merchant authorization before reading any history', async () => {
  jest.mocked(authorizeLoyaltyMerchant).mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
  expect((await GET(request())).status).toBe(403)
  expect(readLoyaltyActivity).not.toHaveBeenCalled()
})
it('returns a non-cached tenant-scoped activity page', async () => {
  const response = await GET(request('&kind=reward_consumed&limit=25'))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(readLoyaltyActivity).toHaveBeenCalledWith({}, tenant, expect.objectContaining({ kind: 'reward_consumed', limit: 25 }))
  expect(await response.json()).toEqual({ events: [], nextCursor: null })
})
it.each(['&cursor=malformed', '&limit=10000', '&kind=unknown', '&from=not-a-date'])('refuses invalid filters: %s', async query => {
  expect((await GET(request(query))).status).toBe(400)
  expect(readLoyaltyActivity).not.toHaveBeenCalled()
})
it('does not expose database errors or claim secrets', async () => {
  jest.mocked(readLoyaltyActivity).mockRejectedValue(new Error('secret database detail'))
  const response = await GET(request())
  expect(response.status).toBe(503)
  expect(JSON.stringify(await response.json())).not.toContain('secret')
})
