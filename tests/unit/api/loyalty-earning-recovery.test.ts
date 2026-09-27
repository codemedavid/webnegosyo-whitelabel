/** @jest-environment node */
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/loyalty/earning-recovery/route'
import { processLoyaltyEarningRecovery } from '@/lib/loyalty/earning-recovery-worker'
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/loyalty/earning-recovery-worker', () => ({ processLoyaltyEarningRecovery: jest.fn() }))
beforeEach(() => { process.env.CRON_SECRET = 'secret'; jest.clearAllMocks() })
it('does not run automatic recovery without the cron secret', async () => {
  expect((await GET(new NextRequest('https://shop.test/api/loyalty/earning-recovery'))).status).toBe(401)
  expect(processLoyaltyEarningRecovery).not.toHaveBeenCalled()
})
it('returns bounded recovery results without caching or exposing order identity', async () => {
  jest.mocked(processLoyaltyEarningRecovery).mockResolvedValue({ checked: 2, credited: 1, failed: 0, pending: 1 })
  const response = await GET(new NextRequest('https://shop.test/api/loyalty/earning-recovery', { headers: { authorization: 'Bearer secret' } }))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({ success: true, checked: 2, credited: 1, failed: 0, pending: 1 })
})
