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
    if (init?.signal) return doFetch(input, init)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await doFetch(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}
