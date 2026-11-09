/**
 * The diners' stock ceilings (`/api/inventory/ceilings`), kept a few seconds
 * per store + branch. Every storefront menu view in an inventory-on store
 * used to read that store's whole stock graph (recipes, components, shelves,
 * units — paged, service role) on the database every store shares.
 *
 * - One Redis hash per store, one field per branch (`store` = store-wide), so
 *   a sale or a stock movement drops every branch with ONE `DEL`.
 * - Each field carries the time it was read and is trusted for
 *   `CEILINGS_CACHE_TTL_MS` only; the hash itself expires shortly after.
 * - Never a boundary and never in the way: Redis absent, slow or failing =
 *   a direct read. Checkout stays the authoritative refusal either way.
 * - Diners only. The register (a member's Bearer token) always reads fresh,
 *   because its `block` policy holds a sale against these numbers.
 */

import { getRedisClient } from '@/lib/redis-cache'

/** How long a diner may see a ceiling that a sale has not yet invalidated. */
export const CEILINGS_CACHE_TTL_MS = 15_000
/** The hash outlives its freshest field by a little, then Redis drops it. */
const KEY_EXPIRY_SECONDS = 30
/** A cache must never make the menu slower than reading the graph. */
const REDIS_DEADLINE_MS = 300
const CACHE_VERSION = 'v1'
const STORE_WIDE_FIELD = 'store'

interface CachedCeilings<T> {
  at: number
  body: T
}

function cacheKey(tenantId: string): string {
  return `stock-ceilings:${CACHE_VERSION}:${tenantId}`
}

function fieldFor(outletId: string | null): string {
  return outletId ?? STORE_WIDE_FIELD
}

async function withDeadline<T>(work: () => Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), REDIS_DEADLINE_MS)
      }),
    ])
  } catch (error) {
    console.warn('[inventory] Ceilings cache unavailable', error instanceof Error ? error.message : error)
    return null
  } finally {
    clearTimeout(timer)
  }
}

function isFresh<T>(entry: unknown, now: number): entry is CachedCeilings<T> {
  if (!entry || typeof entry !== 'object') return false
  const at = (entry as { at?: unknown }).at
  return typeof at === 'number' && at <= now && now - at <= CEILINGS_CACHE_TTL_MS && 'body' in entry
}

/** The cached ceilings when fresh; otherwise `read()`, stored for the next view. A failed read throws and is not stored. */
export async function readThroughCeilingsCache<T>(
  tenantId: string,
  outletId: string | null,
  read: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  const redis = getRedisClient()
  if (!redis) return read()

  const key = cacheKey(tenantId)
  const field = fieldFor(outletId)
  const hit = await withDeadline(() => redis.hget<CachedCeilings<T>>(key, field))
  if (isFresh<T>(hit, now())) return hit.body

  const body = await read()
  const entry: CachedCeilings<T> = { at: now(), body }
  await withDeadline(async () => {
    await redis.hset(key, { [field]: entry })
    await redis.expire(key, KEY_EXPIRY_SECONDS)
  })
  return body
}

/** Stock moved: every branch of the store reads its ceilings fresh on the next view. Never throws. */
export async function invalidateStockCeilings(tenantId: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  await withDeadline(() => redis.del(cacheKey(tenantId)))
}
