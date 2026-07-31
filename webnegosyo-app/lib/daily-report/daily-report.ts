/**
 * The daily inventory report — what a day cost, and what went missing.
 *
 * Two questions the ledger could always answer and never had a reader for:
 *
 *  - **COGS.** `sale` rows are derived from recipes, not from counting, which is
 *    exactly what the trade calls *theoretical usage*. Valued at the ingredient
 *    cost, they are the cost of what was sold.
 *  - **Shrinkage.** A stocktake stores the *discrepancy* as its delta (see
 *    `resolveMovementDelta`), so the gap between what the system expected and
 *    what was physically on the shelf is already written down. The gap is the
 *    *variance*; the loss it represents is *shrinkage*.
 *
 * Pure by design — no dates are formatted and no database is touched — so the
 * merchant app can render the same report from the same rules, the way
 * `stock-history.ts` and `low-stock.ts` already are.
 */

import type { StockMovementReason } from './movement-reason'

export interface DailyReportMovement {
  inventoryItemId: string
  reason: StockMovementReason
  /** Signed, already in the ingredient's stock unit. */
  quantityDelta: number
  /**
   * Running total the trigger wrote. Never recomputed here.
   *
   * Since migration 20260808120000 this is the balance AT THIS MOVEMENT'S
   * BRANCH, not the store total — which is why the reconciliation below groups
   * by branch before it reads an opening or a closing.
   */
  balanceAfter: number
  createdAt: string
  /**
   * The branch this movement happened at. Absent on every row written before
   * branches existed, and on every single-shop tenant's rows — which must be
   * read as "the one shelf", not as a branch of its own.
   */
  outletId?: string | null
}

export interface DailyReportIngredient {
  id: string
  name: string
  /** Per stock unit. Zero means "never priced", not "free". */
  unitCost: number
  stockUnitAbbreviation: string
}

export interface DailyReportRow {
  inventoryItemId: string
  name: string
  stockUnitAbbreviation: string
  /** On hand before the first movement of the window. */
  opening: number
  /** Deliveries in. */
  received: number
  /** Theoretical usage: what the recipes say the sales consumed, net of voids. */
  sold: number
  /** Recorded waste, as a positive magnitude. */
  waste: number
  /** Signed correction a physical count applied. Negative means stock was short. */
  countAdjustment: number
  /**
   * Net moved to or from another branch, signed. Negative means stock left.
   *
   * Its own figure because a transfer is neither usage nor a loss — the stock
   * is on another shelf — but it still moves the closing balance, so without it
   * the row's arithmetic would not add up.
   */
  transferred: number
  /** The short side of `countAdjustment` only — a positive number of units lost. */
  shrinkage: number
  /** On hand after the last movement of the window. */
  closing: number
  cogs: number
  wasteCost: number
  shrinkageCost: number
  /** Whether anyone physically counted this ingredient in the window. */
  wasCounted: boolean
}

export interface DailyInventoryReport {
  /** Worst first, ranked by the money missing. */
  rows: DailyReportRow[]
  totals: {
    cogs: number
    wasteCost: number
    shrinkageCost: number
  }
  /** Ingredients physically counted in the window. */
  countedCount: number
  /** Ingredients that moved but were never counted. */
  uncountedCount: number
  /** Ingredients that moved but carry no cost, so their money is missing from the totals. */
  uncostedCount: number
}

export interface DailyInventoryReportInput {
  movements: readonly DailyReportMovement[]
  ingredients: readonly DailyReportIngredient[]
}

const EMPTY_TOTALS = { cogs: 0, wasteCost: 0, shrinkageCost: 0 }

/**
 * Negating a zero sum yields `-0`, which formats as "-0" and reads on a report
 * as a loss too small to name rather than as nothing at all.
 */
function magnitude(signedTotal: number): number {
  const flipped = -signedTotal
  return flipped === 0 ? 0 : flipped
}

/**
 * Reconcile a window of the ledger into one row per ingredient that moved.
 *
 * The identity every row satisfies is
 * `opening + received − sold − waste + transferred ± countAdjustment = closing`,
 * which is what
 * makes the report checkable by eye rather than merely believable.
 */
export function buildDailyInventoryReport(
  input: DailyInventoryReportInput,
): DailyInventoryReport {
  const { movements, ingredients } = input
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]))

  // A deleted ingredient leaves its ledger rows behind. They name something
  // that can no longer be valued or titled, so they are dropped rather than
  // rendered as a blank line with a number beside it.
  const byIngredient = new Map<string, DailyReportMovement[]>()
  for (const movement of movements) {
    if (!ingredientById.has(movement.inventoryItemId)) continue
    const existing = byIngredient.get(movement.inventoryItemId) ?? []
    existing.push(movement)
    byIngredient.set(movement.inventoryItemId, existing)
  }

  const rows: DailyReportRow[] = []
  for (const [inventoryItemId, itemMovements] of byIngredient) {
    const ingredient = ingredientById.get(inventoryItemId)
    if (!ingredient) continue
    rows.push(buildRow(ingredient, itemMovements))
  }

  // Ranked by the money missing, never by the percentage. A 30% variance on
  // garlic is noise; 4% on beef is the month's margin.
  rows.sort((a, b) => b.shrinkageCost - a.shrinkageCost || b.cogs - a.cogs)

  const totals = rows.reduce(
    (running, row) => ({
      cogs: running.cogs + row.cogs,
      wasteCost: running.wasteCost + row.wasteCost,
      shrinkageCost: running.shrinkageCost + row.shrinkageCost,
    }),
    EMPTY_TOTALS,
  )

  return {
    rows,
    totals,
    countedCount: rows.filter((row) => row.wasCounted).length,
    uncountedCount: rows.filter((row) => !row.wasCounted).length,
    // Their quantities are right and their money is absent, so the totals
    // understate the day. Counting them lets the caller say so.
    uncostedCount: rows.filter((row) => ingredientById.get(row.inventoryItemId)?.unitCost === 0)
      .length,
  }
}

/** One shelf's key. `null` and `undefined` are the same shelf: the store pool. */
function branchKeyOf(movement: DailyReportMovement): string {
  return movement.outletId ?? ''
}

/**
 * Opening and closing, summed across the branches that moved today.
 *
 * `balanceAfter` is a running total for ONE branch, so a day's movements read
 * as a single stream take the opening from whichever branch moved first and the
 * closing from whichever moved last. For a single-shop tenant those are the
 * same shelf and nothing changes; for a branched one the row stops satisfying
 * `opening + received − sold − waste + transferred ± count = closing`, and a
 * row a merchant cannot check by eye is worse than no row.
 *
 * Branches that did not move today contribute nothing to EITHER figure, so the
 * identity still holds — their stock is simply outside the day's story.
 */
function balancesAcrossBranches(ordered: readonly DailyReportMovement[]): {
  opening: number
  closing: number
} {
  const firstByBranch = new Map<string, DailyReportMovement>()
  const lastByBranch = new Map<string, DailyReportMovement>()

  for (const movement of ordered) {
    const key = branchKeyOf(movement)
    if (!firstByBranch.has(key)) firstByBranch.set(key, movement)
    lastByBranch.set(key, movement)
  }

  let opening = 0
  let closing = 0
  // Derived from the rows themselves — `balance_after` minus the delta that
  // produced it — so the opening costs no extra query and cannot disagree with
  // the ledger.
  for (const movement of firstByBranch.values()) {
    opening += movement.balanceAfter - movement.quantityDelta
  }
  for (const movement of lastByBranch.values()) {
    closing += movement.balanceAfter
  }

  return { opening, closing }
}

/**
 * Shrinkage, per branch and then summed.
 *
 * Netting the branches first would let North being 40 short cancel South being
 * 40 long and report a spotless day while a shelf is genuinely missing 40 —
 * the exact failure the shrinkage figure exists to surface. Only the SHORT side
 * of each branch counts, for the same reason it does within one.
 */
function shrinkageAcrossBranches(ordered: readonly DailyReportMovement[]): number {
  const adjustmentByBranch = new Map<string, number>()

  for (const movement of ordered) {
    if (movement.reason !== 'stocktake') continue
    const key = branchKeyOf(movement)
    adjustmentByBranch.set(key, (adjustmentByBranch.get(key) ?? 0) + movement.quantityDelta)
  }

  let shrinkage = 0
  for (const adjustment of adjustmentByBranch.values()) {
    if (adjustment < 0) shrinkage += -adjustment
  }
  return shrinkage
}

function buildRow(
  ingredient: DailyReportIngredient,
  movements: readonly DailyReportMovement[],
): DailyReportRow {
  // Time order, not array order: the ledger is usually read newest-first, and
  // taking the array's first row as the opening would invert the whole day.
  const ordered = [...movements].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const { opening, closing } = balancesAcrossBranches(ordered)

  let received = 0
  let saleNet = 0
  let waste = 0
  let countAdjustment = 0
  let transferred = 0

  for (const movement of ordered) {
    switch (movement.reason) {
      case 'receive':
        received += movement.quantityDelta
        break
      // A void reverses the sale it names. Netting them means a cancelled order
      // consumed nothing, which is the truth; counting the void as a delivery
      // would inflate both purchases and usage for a sale that never happened.
      case 'sale':
      case 'void':
        saleNet += movement.quantityDelta
        break
      case 'waste':
        waste += movement.quantityDelta
        break
      case 'stocktake':
        countAdjustment += movement.quantityDelta
        break
      // Transfers get their own bucket rather than joining one of the others.
      // Stock sent to another branch was not consumed and was not lost — it is
      // on a different shelf — so charging it to usage would make a branch that
      // supplies the others look like it is haemorrhaging stock, and charging
      // it to shrinkage would accuse someone of losing it.
      //
      // Kept SIGNED, unlike sold and waste: out and in genuinely cancel, and a
      // branch that sent 200 and received 50 moved 150 net.
      case 'transfer_out':
      case 'transfer_in':
        transferred += movement.quantityDelta
        break
    }
  }

  // Usage is reported as a positive magnitude: "sold 200" reads correctly on
  // every screen, where the ledger's signed "-200" does not.
  const sold = magnitude(saleNet)
  const wasteMagnitude = magnitude(waste)

  // Only the SHORT side is shrinkage. A long count is a real fault — a
  // miscount, a mis-keyed delivery — but it is not a loss, and letting it
  // subtract would net out genuine losses elsewhere and report a clean day.
  // Judged per branch for exactly that reason: see `shrinkageAcrossBranches`.
  const shrinkage = shrinkageAcrossBranches(ordered)

  return {
    inventoryItemId: ingredient.id,
    name: ingredient.name,
    stockUnitAbbreviation: ingredient.stockUnitAbbreviation,
    opening,
    received,
    sold,
    waste: wasteMagnitude,
    countAdjustment,
    transferred,
    shrinkage,
    closing,
    cogs: sold * ingredient.unitCost,
    wasteCost: wasteMagnitude * ingredient.unitCost,
    shrinkageCost: shrinkage * ingredient.unitCost,
    wasCounted: ordered.some((movement) => movement.reason === 'stocktake'),
  }
}
