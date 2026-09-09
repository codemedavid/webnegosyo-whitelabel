const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether a value can be compared against a Postgres `uuid` column.
 *
 * Order ids arrive from three backends. Platform orders are uuids; Convex
 * orders are opaque strings like `js71q9w4ja9g3ryvap69b9xxms8e3fzs`. Handing a
 * Convex id to PostgREST as a uuid filter is a hard 400 (`invalid input syntax
 * for type uuid`), so a lookup that only makes sense for platform rows must be
 * skipped, not attempted, for the other backends.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}
