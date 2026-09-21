import { unstable_cache } from 'next/cache'

/**
 * Cross-request caching for storefront reads.
 *
 * Every public storefront read goes through `createCachedRead`, which wraps
 * Next's data cache (`unstable_cache`) with two conventions:
 *
 * 1. One revalidation window for the whole storefront. The menu page always
 *    claimed "ISR, 5 minutes"; this is where that promise is actually kept.
 * 2. Failures are never cached. A loader returns `doNotCache(value)` for a
 *    result that must reach the caller but must not be stored — a timed-out
 *    branch query, say, which the menu carries as an "ordering blocked" flag.
 *    Storing it would pin the block for the full window after a one-second
 *    blip. The wrapper turns that marker into a rejection at the cache
 *    boundary (rejections are not persisted) and unwraps it for the caller.
 *
 * Tags: every entry is tagged by tenant so a settings or menu write can purge
 * one merchant's storefront — see `revalidateStorefront`. Next also attaches
 * the rendering route's implicit path tags, so the existing
 * `revalidatePath('/<slug>/menu')` calls in server actions keep working.
 */
export const STOREFRONT_REVALIDATE_SECONDS = 300

export function storefrontTag(tenantSlug: string): string {
  return `storefront:${tenantSlug}`
}

/** For reads keyed by tenant id rather than slug (product detail data). */
export function storefrontTenantIdTag(tenantId: string): string {
  return `storefront-tenant:${tenantId}`
}

const UNCACHED = Symbol('storefront.uncached')

export interface Uncached<T> {
  readonly [UNCACHED]: true
  readonly value: T
}

/** Mark a loader result as return-once: delivered to the caller, never stored. */
export function doNotCache<T>(value: T): Uncached<T> {
  return { [UNCACHED]: true, value }
}

function isUncached<T>(result: T | Uncached<T>): result is Uncached<T> {
  return typeof result === 'object' && result !== null && UNCACHED in result
}

/** Carries an uncacheable result out through the cache boundary. */
class UncachedResultSignal<T> extends Error {
  constructor(readonly value: T) {
    super('storefront read result must not be cached')
    this.name = 'UncachedResultSignal'
  }
}

interface CachedReadOptions<Args extends unknown[]> {
  /** Cache tags for a given call; must be deterministic in the arguments. */
  tags: (...args: Args) => string[]
  revalidate?: number
}

/**
 * Wrap a loader in the storefront data cache.
 *
 * The cache key is `keyParts` plus the JSON-serialised arguments, so a loader
 * keyed by slug or id needs no manual key building. Results must be JSON
 * serialisable — return arrays and plain objects, never a `Map`.
 */
export function createCachedRead<Args extends unknown[], T>(
  keyParts: readonly string[],
  loader: (...args: Args) => Promise<T | Uncached<T>>,
  options: CachedReadOptions<Args>
): (...args: Args) => Promise<T> {
  const revalidate = options.revalidate ?? STOREFRONT_REVALIDATE_SECONDS

  const boundary = async (...args: Args): Promise<T> => {
    const result = await loader(...args)
    if (isUncached(result)) throw new UncachedResultSignal(result.value)
    return result
  }

  return async (...args: Args): Promise<T> => {
    // Built per call because the tags depend on the arguments; unstable_cache
    // itself is cheap to construct and keys on `keyParts` + args.
    const cached = unstable_cache(boundary, [...keyParts], { revalidate, tags: options.tags(...args) })
    try {
      return await cached(...args)
    } catch (error) {
      if (error instanceof UncachedResultSignal) return error.value as T
      throw error
    }
  }
}
