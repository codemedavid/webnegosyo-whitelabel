/**
 * Which shelf a manual stock movement lands on, before the merchant says.
 *
 * The web stock dialog wrote every receive/waste/stocktake to the store pool
 * while order depletion wrote to the ORDER's branch — a multi-branch tenant's
 * shelves drifted apart from the day they opened a second shop. These rules
 * pick the default the selector starts on, and name the shelf a movement is
 * about to touch.
 *
 * Pure, like `stock-location.ts`: the merchant app will grow the same selector
 * and must not compute the default differently.
 */

/** A branch as the selector offers it. */
export interface SelectableBranch {
  id: string
  name: string
}

/** What the unbranched shelf is called everywhere it is offered. */
export const STORE_POOL_LABEL = 'Store pool'

/**
 * The shelf a movement starts aimed at.
 *
 * A single-branch tenant's every shelf IS that branch, so defaulting to the
 * pool would recreate the drift the selector exists to end. With several
 * branches nothing can be assumed, and with none the store pool is the only
 * shelf there is — the behaviour every tenant has today.
 */
export function resolveDefaultMovementOutlet(
  branches: readonly SelectableBranch[],
): string | null {
  if (branches.length === 1) return branches[0].id
  return null
}

/** Names the shelf, falling back to the store pool for an id it cannot place. */
export function movementOutletLabel(
  outletId: string | null,
  branches: readonly SelectableBranch[],
): string {
  if (outletId === null) return STORE_POOL_LABEL
  return branches.find((branch) => branch.id === outletId)?.name ?? STORE_POOL_LABEL
}
