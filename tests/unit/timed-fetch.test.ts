/**
 * @jest-environment node
 */
/**
 * Every Supabase call the edge middleware makes used the default fetch, which
 * never gives up. When PostgREST stalled, the middleware simply waited until
 * Vercel killed it at 25s — a 504 on every page for as long as the outage
 * lasted. A bounded fetch turns "hang" into "fail open in 3 seconds".
 */
import { getEventListeners } from 'node:events'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'

describe('createTimedFetch', () => {
  describe('caller cancellation', () => {
    it.each([undefined, { signal: undefined }])(
      'inherits the Request signal when init is %p',
      async (init) => {
        const caller = new AbortController()
        const reason = new Error('caller cancelled')
        const request = new Request('https://example.test', { signal: caller.signal })
        const base: typeof fetch = async (_input, options) => {
          caller.abort(reason)
          options?.signal?.throwIfAborted()
          return new Response('ok')
        }

        await expect(createTimedFetch(1000, base)(request, init)).rejects.toBe(reason)
      }
    )

    it('preserves the reason when the caller was already aborted', async () => {
      const reason = new Error('cancelled before fetch')
      const caller = new AbortController()
      caller.abort(reason)
      const base: typeof fetch = async (_input, options) => {
        options?.signal?.throwIfAborted()
        return new Response('ok')
      }

      await expect(
        createTimedFetch(1000, base)('https://example.test', { signal: caller.signal })
      ).rejects.toBe(reason)
    })

    it('uses the init signal instead of the Request signal', async () => {
      const original = new AbortController()
      const override = new AbortController()
      const reason = new Error('override cancelled')
      const request = new Request('https://example.test', { signal: original.signal })
      original.abort()
      const base: typeof fetch = async (_input, options) => {
        expect(options?.signal?.aborted).toBe(false)
        override.abort(reason)
        options?.signal?.throwIfAborted()
        return new Response('ok')
      }

      await expect(
        createTimedFetch(1000, base)(request, { signal: override.signal })
      ).rejects.toBe(reason)
    })

    it('allows a null init signal to disable Request cancellation', async () => {
      const original = new AbortController()
      const request = new Request('https://example.test', { signal: original.signal })
      original.abort()
      const response = new Response('ok')
      const base: typeof fetch = async (_input, options) => {
        expect(options?.signal?.aborted).toBe(false)
        return response
      }

      await expect(createTimedFetch(1000, base)(request, { signal: null })).resolves.toBe(response)
    })
  })

  describe('resource cleanup', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it.each(['success', 'rejection', 'synchronous throw', 'timeout', 'caller abort'])(
      'releases the caller listener and timer after %s',
      async (outcome) => {
        const caller = new AbortController()
        const error = new Error('fetch failed')
        const response = new Response('ok')
        const base: typeof fetch = (_input, options) => {
          if (outcome === 'synchronous throw') throw error
          if (outcome === 'rejection') return Promise.reject(error)
          if (outcome === 'success') return Promise.resolve(response)
          return new Promise<Response>((_resolve, reject) => {
            if (outcome === 'caller abort') {
              options?.signal?.addEventListener('abort', () => reject(error), { once: true })
            }
          })
        }
        const pending = createTimedFetch(50, base)('https://example.test', { signal: caller.signal })
        if (outcome === 'timeout') jest.advanceTimersByTime(50)
        if (outcome === 'caller abort') caller.abort()

        if (outcome === 'success') await expect(pending).resolves.toBe(response)
        else if (outcome === 'timeout') await expect(pending).resolves.toHaveProperty('status', 408)
        else await expect(pending).rejects.toBe(error)

        expect(jest.getTimerCount()).toBe(0)
        expect(getEventListeners(caller.signal, 'abort')).toHaveLength(0)
      }
    )
  })

  it('hands the underlying fetch an abort signal', async () => {
    const base = jest.fn(async () => new Response('ok'))
    const { createTimedFetch } = await import('@/lib/supabase/timed-fetch')

    const timed = createTimedFetch(1000, base as unknown as typeof fetch)
    await timed('https://example.test/rest/v1/tenants')

    const [, init] = base.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal?.aborted).toBe(false)
  })

  it('aborts when the caller signal fires', async () => {
    const base = jest.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          )
        })
    )
    const { createTimedFetch } = await import('@/lib/supabase/timed-fetch')
    const own = new AbortController()

    const timed = createTimedFetch(1000, base as unknown as typeof fetch)
    const pending = timed('https://example.test', { signal: own.signal })
    const outcome = pending.catch((e: Error) => e.name)
    own.abort()

    await expect(outcome).resolves.toBe('AbortError')
  })

  it('still times out when the caller already supplied a signal', async () => {
    // postgrest-js always passes `signal: this.signal` (often undefined, but
    // sometimes a real AbortController). Skipping our budget in that case is
    // how a 3s timeout became a 25s 504.
    jest.useFakeTimers()
    try {
      const base = jest.fn(() => new Promise<Response>(() => {}))
      const { createTimedFetch } = await import('@/lib/supabase/timed-fetch')
      const own = new AbortController()

      const timed = createTimedFetch(50, base as unknown as typeof fetch)
      const pending = timed('https://example.test', { signal: own.signal })
      jest.advanceTimersByTime(60)

      const response = await pending
      expect(response.status).toBe(408)
    } finally {
      jest.useRealTimers()
    }
  })

  it('returns 408 instead of throwing when the request outlives the budget', async () => {
    // auth-js wraps every thrown fetch error as AuthRetryableFetchError and
    // retries until a 30s tick elapses. Throwing AbortError is how a 3s
    // budget became ~8 stacked attempts and a 25s 504. A completed 408
    // is not in that retry set, so GoTrue and PostgREST both stop.
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
      jest.advanceTimersByTime(60)

      const response = await pending
      expect(response.status).toBe(408)
    } finally {
      jest.useRealTimers()
    }
  })

  it('still gives up when the underlying fetch ignores abort', async () => {
    // Vercel Edge will hold a middleware open until every awaited promise
    // settles. A hung TCP connection to PostgREST often ignores AbortSignal,
    // which is how 2b1ce6b4's 3s timeout still produced 25s 504s.
    jest.useFakeTimers()
    try {
      const base = jest.fn(() => new Promise<Response>(() => {}))
      const { createTimedFetch } = await import('@/lib/supabase/timed-fetch')

      const timed = createTimedFetch(50, base as unknown as typeof fetch)
      const pending = timed('https://example.test')
      jest.advanceTimersByTime(60)

      const response = await pending
      expect(response.status).toBe(408)
    } finally {
      jest.useRealTimers()
    }
  })
})
