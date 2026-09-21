/**
 * A fetch that gives up.
 *
 * Supabase's client never times out on its own, and Vercel kills an edge
 * middleware invocation that has not answered within 25 seconds. So every
 * untimed call from the middleware is a bet that PostgREST or GoTrue answers
 * quickly, and when the database is saturated that bet loses on every request
 * at once: the whole site returns 504 until the outage ends. Bounding the
 * fetch turns a stalled backend into a fast "no tenant / no session", which
 * the callers already know how to handle.
 *
 * Aborting the request is not enough on its own: a hung TCP connection on
 * Vercel Edge often ignores AbortSignal. The timer therefore settles the
 * caller even when fetch never does. It settles with HTTP 408, not a thrown
 * AbortError: auth-js wraps every thrown fetch as AuthRetryableFetchError
 * and retries until a 30s tick, which is how a 3s budget still 504'd.
 *
 * Implemented with AbortController + setTimeout rather than
 * `AbortSignal.timeout` so it behaves identically on the edge runtime, Node
 * and jsdom, and so the timer is cleared as soon as the request settles.
 */
export function createTimedFetch(
  timeoutMs: number,
  baseFetch?: typeof fetch
): typeof fetch {
  return async (input, init) => {
    // Resolved per call, not at construction: the client is built at module
    // scope in places where a global fetch is only installed later.
    const doFetch = baseFetch ?? globalThis.fetch

    const controller = new AbortController()
    const caller = init?.signal
    if (caller) {
      if (caller.aborted) controller.abort()
      else caller.addEventListener('abort', () => controller.abort(), { once: true })
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    const timeoutResponse = () =>
      new Response(JSON.stringify({ message: `Timed out after ${timeoutMs}ms` }), {
        status: 408,
        headers: { 'Content-Type': 'application/json' },
      })

    const deadline = new Promise<Response>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true
        // Resolve a completed 408 rather than throw: auth-js wraps every
        // thrown fetch (including AbortError) as AuthRetryableFetchError and
        // retries until a 30s tick, which is how a 3s budget still 504'd.
        // 408 is outside that retry set (500–504, 520–530).
        resolve(timeoutResponse())
        controller.abort()
      }, timeoutMs)
    })

    const inFlight = doFetch(input, { ...init, signal: controller.signal }).catch((error: unknown) => {
      if (timedOut) return timeoutResponse()
      throw error
    })

    try {
      return await Promise.race([inFlight, deadline])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
}
