/**
 * What a register may ask `/api/inventory/order-stock` to spend or return.
 *
 * The route writes with the service role, so a request's lines cannot be the
 * authority: any staffer holding `pos` could name a dish and a quantity and
 * move a shelf. The authority is the order the server reads. A line is only
 * honoured when that order — now, or at an earlier edit — could account for it.
 *
 * - `deplete` (the original sale, or a QR hand-off): per dish, no more than the
 *   most the order ever held of it. "Ever" matters: the register's stock calls
 *   ride an offline queue, so the sale's call can land after a later edit has
 *   already removed the dish from the order's current lines. `order_revisions`
 *   keeps every earlier state.
 * - `revise` (an edit's difference): per dish, exactly that revision's change.
 *   The register nets by CONFIGURATION (a Small swapped for a Large latte is a
 *   restore plus a deplete), which nets to the dish's own change in quantity.
 *   Bounding by revision rather than by the current lines is what lets an
 *   oldest-first offline flush deliver edit 2 before edit 3 without a refusal.
 *
 * Option and add-on ids are not stored in full on an order, so they cannot be
 * matched exactly. They are checked for membership instead: an id must be one
 * of the dish's own options (its menu row) or one the order's saved selection
 * snapshot recorded. An id that is neither is dropped, not refused — it cannot
 * resolve to a recipe of that dish anyway, and a menu option deleted since the
 * sale must not cost the rest of the call its stock.
 *
 * Pure. The reads that build {@link OrderLineEvidence} live in
 * `order-stock-lines-read.ts`.
 */

import type { DepletionOrderItem } from '@/lib/inventory/order-depletion'

/** Units per dish. */
export type DishTotals = ReadonlyMap<string, number>

/** The two sides of one recorded edit. */
export interface RevisionTotals {
  before: DishTotals
  after: DishTotals
}

export interface OrderLineEvidence {
  /** The order's lines as stored right now. */
  current: DishTotals
  /** The order's own edit counter; null = the backend does not say. */
  revisionNumber: number | null
  /** Every recorded edit, by revision number. */
  revisions: ReadonlyMap<number, RevisionTotals>
  /** False when edits are not readable (a Convex deployment keeps them out of reach). */
  hasRevisionHistory: boolean
  /** Option/add-on ids the order's `_inventory_selections` snapshot saved, per dish. */
  selectionIds: ReadonlyMap<string, ReadonlySet<string>>
  /** Option/add-on ids the dish's menu row offers, per dish. */
  menuOptionIds: ReadonlyMap<string, ReadonlySet<string>>
}

export type LinesRefusalCode = 'lines_do_not_match_order' | 'revision_not_on_order'

export type DepleteVerdict =
  | { ok: true; lines: DepletionOrderItem[] }
  | { ok: false; code: LinesRefusalCode }

export type ReviseVerdict =
  | { ok: true; deplete: DepletionOrderItem[]; restore: DepletionOrderItem[] }
  | { ok: false; code: LinesRefusalCode }

const MISMATCH: { ok: false; code: LinesRefusalCode } = { ok: false, code: 'lines_do_not_match_order' }
const NO_REVISION: { ok: false; code: LinesRefusalCode } = { ok: false, code: 'revision_not_on_order' }

/** Sums quantities per dish. A line with no dish id (a deleted item) spends nothing and is skipped. */
export function totalsByDish(lines: ReadonlyArray<{ menuItemId: string; quantity: number }>): DishTotals {
  const totals = new Map<string, number>()
  for (const { menuItemId, quantity } of lines) {
    if (!menuItemId) continue
    totals.set(menuItemId, (totals.get(menuItemId) ?? 0) + quantity)
  }
  return totals
}

function mostEverHeld(dish: string, evidence: OrderLineEvidence): number {
  const counts = [evidence.current.get(dish) ?? 0]
  for (const { before, after } of evidence.revisions.values()) {
    counts.push(before.get(dish) ?? 0, after.get(dish) ?? 0)
  }
  return Math.max(...counts)
}

function keepKnown(ids: readonly string[], known: ReadonlySet<string>): string[] {
  return ids.filter((id) => known.has(id))
}

/** The line with every option/add-on id the dish does not own removed. */
function withKnownOptions(line: DepletionOrderItem, evidence: OrderLineEvidence): DepletionOrderItem {
  const menuIds = evidence.menuOptionIds.get(line.menuItemId)
  // No menu row to check against (the dish was deleted): nothing to judge by.
  if (!menuIds) return line
  const known = new Set([...menuIds, ...(evidence.selectionIds.get(line.menuItemId) ?? [])])
  const addonIds = keepKnown(line.addonIds ?? [], known)
  const addonQuantities = Object.fromEntries(
    Object.entries(line.addonQuantities ?? {}).filter(([id]) => addonIds.includes(id)),
  )
  return {
    menuItemId: line.menuItemId,
    quantity: line.quantity,
    optionIds: keepKnown(line.optionIds ?? [], known),
    addonIds,
    modifierOptionIds: keepKnown(line.modifierOptionIds ?? [], known),
    ...(Object.keys(addonQuantities).length > 0 ? { addonQuantities } : {}),
  }
}

export function checkDepleteLines(
  lines: readonly DepletionOrderItem[],
  evidence: OrderLineEvidence,
): DepleteVerdict {
  // An edited order whose edits cannot be read has lost the states a late
  // sale call is entitled to name; refusing would drop a valid register call.
  const isHistoryMissing = !evidence.hasRevisionHistory && (evidence.revisionNumber ?? 0) > 0
  if (!isHistoryMissing) {
    for (const [dish, requested] of totalsByDish(lines)) {
      if (requested > mostEverHeld(dish, evidence)) return MISMATCH
    }
  }
  return { ok: true, lines: lines.map((line) => withKnownOptions(line, evidence)) }
}

export function checkReviseLines(
  revision: number,
  deplete: readonly DepletionOrderItem[],
  restore: readonly DepletionOrderItem[],
  evidence: OrderLineEvidence,
): ReviseVerdict {
  if (evidence.revisionNumber !== null && revision > evidence.revisionNumber) return NO_REVISION

  if (evidence.hasRevisionHistory) {
    const edit = evidence.revisions.get(revision)
    if (!edit) return NO_REVISION

    const spent = totalsByDish(deplete)
    const returned = totalsByDish(restore)
    for (const dish of new Set([...spent.keys(), ...returned.keys()])) {
      const netRequested = (spent.get(dish) ?? 0) - (returned.get(dish) ?? 0)
      const netEdited = (edit.after.get(dish) ?? 0) - (edit.before.get(dish) ?? 0)
      if (netRequested !== netEdited) return MISMATCH
    }
  }

  return {
    ok: true,
    deplete: deplete.map((line) => withKnownOptions(line, evidence)),
    restore: restore.map((line) => withKnownOptions(line, evidence)),
  }
}
