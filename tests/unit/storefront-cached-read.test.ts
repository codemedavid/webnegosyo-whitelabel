/**
 * The storefront data cache must never store a failure.
 *
 * `unstable_cache` persists whatever the loader resolves with, so a loader that
 * returns "the branch query failed" as ordinary data would pin that failure —
 * and the ordering block it triggers — for the whole revalidation window.
 * `doNotCache` marks a result as return-once, and the wrapper delivers it to
 * the caller without letting the cache see it.
 */

const cacheSpy = jest.fn()

jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], options: unknown) => {
    cacheSpy(keyParts, options)
    return fn
  },
}))

describe('createCachedRead', () => {
  beforeEach(() => cacheSpy.mockClear())

  test('returns a cacheable result through the cache boundary', async () => {
    const { createCachedRead } = await import('@/lib/storefront/cached-read')
    const read = createCachedRead(['thing'], async (id: string) => ({ id }), {
      tags: (id) => [`thing:${id}`],
    })

    await expect(read('a')).resolves.toEqual({ id: 'a' })
    expect(cacheSpy).toHaveBeenCalledWith(['thing'], expect.objectContaining({ tags: ['thing:a'], revalidate: 300 }))
  })

  test('delivers a doNotCache result to the caller without storing it', async () => {
    const { createCachedRead, doNotCache } = await import('@/lib/storefront/cached-read')
    const loader = jest.fn(async () => doNotCache({ failed: true }))
    const read = createCachedRead(['thing'], loader, { tags: () => [] })

    // The cache boundary is the loader passed to unstable_cache; it must REJECT
    // for an uncacheable result so nothing is persisted...
    await expect(read()).resolves.toEqual({ failed: true })
    // ...and a second call re-runs the loader instead of reusing anything.
    await read()
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('rethrows genuine loader errors', async () => {
    const { createCachedRead } = await import('@/lib/storefront/cached-read')
    const read = createCachedRead(['thing'], async () => { throw new Error('boom') }, { tags: () => [] })
    await expect(read()).rejects.toThrow('boom')
  })

  /*
   * Next's data cache refuses entries over 2 MB: in production it logs and
   * skips the write (so every view re-runs the query plan), in development it
   * THROWS into the page. The wrapper measures the entry the way Next stores
   * it (the result JSON, stringified again as the entry body) and delivers an
   * oversized result without offering it to the cache at all.
   */
  test('delivers an oversized result without offering it to the cache', async () => {
    const { createCachedRead } = await import('@/lib/storefront/cached-read')
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const big = { rows: 'x'.repeat(500) }
    const read = createCachedRead(['big'], async () => big, { tags: () => [], maxEntryBytes: 100 })

    await expect(read()).resolves.toEqual(big)

    const boundary = cacheSpy.mock.calls[0]
    expect(boundary).toBeDefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('too large to cache'))
    warn.mockRestore()
  })

  test('counts the escaping Next adds when it stores the entry body', async () => {
    const { measureCacheEntryBytes } = await import('@/lib/storefront/cached-read')
    // Every quote in the result is escaped again inside the entry body.
    const value = { a: '"' }
    expect(measureCacheEntryBytes(value)).toBe(JSON.stringify(JSON.stringify(value)).length)
    expect(measureCacheEntryBytes(value)).toBeGreaterThan(JSON.stringify(value).length)
  })

  test('caches a result under the size limit as before', async () => {
    const { createCachedRead } = await import('@/lib/storefront/cached-read')
    const loader = jest.fn(async () => ({ small: true }))
    const read = createCachedRead(['small'], loader, { tags: () => [], maxEntryBytes: 1000 })

    await expect(read()).resolves.toEqual({ small: true })
  })

  test('storefront tags are stable per slug and per tenant id', async () => {
    const { storefrontTag, storefrontTenantIdTag } = await import('@/lib/storefront/cached-read')
    expect(storefrontTag('cafe')).toBe('storefront:cafe')
    expect(storefrontTenantIdTag('t-1')).toBe('storefront-tenant:t-1')
  })
})
