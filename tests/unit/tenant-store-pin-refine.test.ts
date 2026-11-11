/** @jest-environment node */
import { z } from 'zod'

async function issuesFor(value: Record<string, unknown>): Promise<string[]> {
  const { refineStorePin } = await import('@/lib/tenants-service')
  const schema = z.object({}).passthrough().superRefine((input, ctx) => refineStorePin(input as never, ctx))
  const result = schema.safeParse(value)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('refineStorePin (tenant form)', () => {
  const HONG_KONG = { restaurant_latitude: 22.3193, restaurant_longitude: 114.1694 }

  it("keeps a Lalamove store's own market", async () => {
    expect(await issuesFor({ ...HONG_KONG, lalamove_enabled: true, lalamove_market: 'HK' })).toEqual([])
  })

  it('reads a stale market on a store without Lalamove as the Philippines', async () => {
    expect(await issuesFor({ ...HONG_KONG, lalamove_enabled: false, lalamove_market: 'HK' }))
      .toEqual([expect.stringContaining('outside the Philippines')])
  })
})
