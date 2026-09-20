/**
 * @jest-environment node
 */
/**
 * Every Supabase call the edge middleware makes used the default fetch, which
 * never gives up. When PostgREST stalled, the middleware simply waited until
 * Vercel killed it at 25s — a 504 on every page for as long as the outage
 * lasted. A bounded fetch turns "hang" into "fail open in 3 seconds".
 */

describe('createTimedFetch', () => {
  it('hands the underlying fetch an abort signal', async () => {
    const base = jest.fn(async () => new Response('ok'))
    const { createTimedFetch } = await import('@/lib/supabase/timed-fetch')

    const timed = createTimedFetch(1000, base as unknown as typeof fetch)
    await timed('https://example.test/rest/v1/tenants')

    const [, init] = base.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal?.aborted).toBe(false)
  })

  it('keeps a signal the caller already supplied', async () => {
    const base = jest.fn(async () => new Response('ok'))
    const { createTimedFetch } = await import('@/lib/supabase/timed-fetch')
    const own = new AbortController()

    const timed = createTimedFetch(1000, base as unknown as typeof fetch)
    await timed('https://example.test', { signal: own.signal })

    const [, init] = base.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBe(own.signal)
  })

  it('aborts a request that outlives the budget', async () => {
    jest.useFakeTimers()
    try {
      const base = jest.fn(
        (_input: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            )
          })
      )
      const { createTimedFetch } = await import('@/lib/supabase/timed-fetch')

      const timed = createTimedFetch(50, base as unknown as typeof fetch)
      const pending = timed('https://example.test')
      const outcome = pending.catch((e: Error) => e.name)
      jest.advanceTimersByTime(60)

      await expect(outcome).resolves.toBe('AbortError')
    } finally {
      jest.useRealTimers()
    }
  })
})
