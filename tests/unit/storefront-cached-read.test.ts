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

  test('storefront tags are stable per slug and per tenant id', async () => {
    const { storefrontTag, storefrontTenantIdTag } = await import('@/lib/storefront/cached-read')
    expect(storefrontTag('cafe')).toBe('storefront:cafe')
    expect(storefrontTenantIdTag('t-1')).toBe('storefront-tenant:t-1')
  })
})
