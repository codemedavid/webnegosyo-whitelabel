/**
 * Resolve a stored design id (a tenant column such as `card_template`) against
 * its registry. Design columns are free text in the database — new designs
 * ship without a migration — so every read must tolerate null, blank, stale or
 * mistyped values and land on the registry default rather than a dead design.
 */
export function pickDesignId<T extends string>(value: unknown, ids: readonly T[], fallback: T): T {
  return typeof value === 'string' && (ids as readonly string[]).includes(value) ? (value as T) : fallback
}
