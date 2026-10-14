/**
 * Leaving prices out for an account without `costs` (Phase 0d, plan §6.3). Pure.
 *
 * A hidden price is ABSENT, never 0: ₱0 reads as a free ingredient and would
 * quietly zero every margin built on it.
 */

import { hasPermission, type PermissionHolder } from '@/lib/staff-permissions'

export function canSeeCosts(holder: PermissionHolder): boolean {
  return hasPermission(holder, 'costs')
}

/** The rows without `unit_cost`. */
export function withoutUnitCost<T extends { unit_cost?: unknown }>(rows: readonly T[]): Array<Omit<T, 'unit_cost'>> {
  return rows.map(
    (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'unit_cost')) as Omit<T, 'unit_cost'>,
  )
}

/** The rows as `holder` may see them: priced with `costs`, unpriced without. */
export function ingredientsForCaller<T extends { unit_cost?: unknown }>(
  rows: readonly T[],
  holder: PermissionHolder,
): Array<T | Omit<T, 'unit_cost'>> {
  return canSeeCosts(holder) ? [...rows] : withoutUnitCost(rows)
}

/**
 * A movement as `holder` may record it. A priced `receive` rewrites the
 * ingredient's cost (the ledger trigger blends it in), so a delivery price is
 * a cost change and needs `costs`; without it the price is dropped and the
 * delivery is recorded uncosted, which leaves the stored cost alone. The
 * database drops it too (migration 20261013120100); this keeps the two in step.
 */
export function movementInputForCaller<T extends { unit_cost?: number | null }>(input: T, holder: PermissionHolder): T {
  return canSeeCosts(holder) ? input : { ...input, unit_cost: undefined }
}

/** A recorded movement and its ingredient, without the costs `holder` may not see. */
export function movementResultForCaller<T extends { movement: { unit_cost?: unknown }; item: { unit_cost?: unknown } }>(
  result: T,
  holder: PermissionHolder,
): T {
  if (canSeeCosts(holder)) return result
  const [movement] = withoutUnitCost([result.movement])
  const [item] = withoutUnitCost([result.item])
  // Same shape minus the price: absent, never 0.
  return { ...result, movement, item } as T
}
