import { createHash } from 'node:crypto'

/**
 * Every Convex→platform import since the first (2026-09) derives platform row
 * ids as UUID v5 of the Convex `_id` under this namespace, so a re-run, a
 * delta, or a second tool all land on the same ids and `on conflict` makes a
 * repeat a no-op. Never change it: imported rows already carry ids from it.
 *
 * (It is not a valid RFC 4122 namespace for the `uuid` package, which refuses
 * it, hence the local implementation.)
 */
export const CONVEX_IMPORT_NAMESPACE = '6f9619ff-8b86-d011-b42d-00c04fc964ff'

export function uuidV5(name: string, namespace: string = CONVEX_IMPORT_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/** A value for a uuid column, or null when Convex stored something else (a uuid column refuses it). */
export function uuidOrNull(value: unknown): string | null {
  return isUuid(value) ? value.toLowerCase() : null
}
