/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'

interface Call { method: string; args: unknown[] }

/**
 * A recording stand-in for the service-role client. Each awaited query takes
 * the next queued response, so a test scripts what the database answers.
 */
function fakeClient(responses: Array<{ data: unknown; error: unknown }>) {
  const queries: Call[][] = []
  const client = {
    from() {
      const calls: Call[] = []
      queries.push(calls)
      const query: Record<string, unknown> = {}
      for (const method of ['select', 'update', 'eq', 'in', 'or', 'is', 'limit']) {
        query[method] = (...args: unknown[]) => { calls.push({ method, args }); return query }
      }
      const next = () => Promise.resolve(responses.shift() ?? { data: null, error: null })
      query.maybeSingle = () => { calls.push({ method: 'maybeSingle', args: [] }); return next() }
      query.single = query.maybeSingle
      query.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next().then(resolve, reject)
      return query
    },
  } as unknown as SupabaseClient
  return { client, queries }
}

const find = (calls: Call[], method: string) => calls.filter((call) => call.method === method)

describe('claimOnboardingBuild', () => {
  test('can take over a running build only once it has gone quiet, in the same conditional update', async () => {
    // Arrange
    const { claimOnboardingBuild } = await import('@/lib/onboarding/repository')
    const { STALE_BUILD_MS } = await import('@/lib/onboarding/build-staleness')
    const { client, queries } = fakeClient([{ data: [{ id: 'onb-1' }], error: null }])
    const before = Date.now()

    // Act
    const claimed = await claimOnboardingBuild(client, 'onb-1', 1)

    // Assert
    expect(claimed).toBe(true)
    const calls = queries[0]
    expect(find(calls, 'in')[0].args).toEqual(['status', ['queued', 'running', 'failed']])
    const filter = String(find(calls, 'or')[0].args[0])
    expect(filter).toMatch(/^status\.neq\.running,updated_at\.lt\."(.+)"$/)
    const cutoff = Date.parse(filter.match(/"(.+)"/)![1])
    expect(cutoff).toBeGreaterThanOrEqual(before - STALE_BUILD_MS)
    expect(cutoff).toBeLessThanOrEqual(Date.now() - STALE_BUILD_MS)
  })
})

describe('updateOnboardingAssets', () => {
  test('a write that lost a race re-reads and keeps the other upload', async () => {
    // Arrange: the first write finds the row already changed by a parallel upload.
    const { updateOnboardingAssets } = await import('@/lib/onboarding/repository')
    const { client, queries } = fakeClient([
      { data: { assets: { menuImageUrls: [] }, status: 'awaiting_details', updated_at: 't0' }, error: null },
      { data: [], error: null },
      { data: { assets: { menuImageUrls: ['a.jpg'] }, status: 'awaiting_details', updated_at: 't1' }, error: null },
      { data: [{ id: 'onb-1' }], error: null },
    ])

    // Act
    const saved = await updateOnboardingAssets(client, 'onb-1', (assets) => ({
      ...assets, menuImageUrls: [...(assets.menuImageUrls ?? []), 'b.jpg'],
    }))

    // Assert
    expect(saved).toEqual({ menuImageUrls: ['a.jpg', 'b.jpg'] })
    const lastWrite = queries[3]
    expect(find(lastWrite, 'update')[0].args[0]).toEqual({ assets: { menuImageUrls: ['a.jpg', 'b.jpg'] } })
    expect(find(lastWrite, 'eq')).toEqual(expect.arrayContaining([
      { method: 'eq', args: ['updated_at', 't1'] },
      { method: 'eq', args: ['status', 'awaiting_details'] },
    ]))
  })

  test('refuses once the build has started', async () => {
    const { updateOnboardingAssets } = await import('@/lib/onboarding/repository')
    const { client } = fakeClient([{ data: { assets: {}, status: 'queued', updated_at: 't0' }, error: null }])

    await expect(updateOnboardingAssets(client, 'onb-1', (a) => a)).rejects.toThrow('This store is already being built.')
  })

  test('returns null without writing when the change is refused', async () => {
    const { updateOnboardingAssets } = await import('@/lib/onboarding/repository')
    const { client, queries } = fakeClient([{ data: { assets: {}, status: 'awaiting_details', updated_at: 't0' }, error: null }])

    await expect(updateOnboardingAssets(client, 'onb-1', () => null)).resolves.toBeNull()
    expect(queries).toHaveLength(1)
  })
})
