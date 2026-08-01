/**
 * Whether inventory is actually doing anything, and if not, why not.
 *
 * Switching the feature on does not make it work. A tenant with no recipes, or
 * no reorder levels, or the alert flag off, sees exactly what a working tenant
 * with a quiet day sees: nothing. The first tenant to enable inventory had one
 * ingredient and zero recipes and no way to discover that.
 *
 * A gap here is deliberately not a warning about the future. It is a statement
 * that some part of the system *currently cannot fire*, plus the reason — which
 * is the only form of this information a merchant can act on.
 *
 * Pure, so the merchant app can show the same verdict from the same rules.
 */

import { evaluateStockLevel, type StockLevelInput } from '@/lib/inventory/low-stock'
import type { RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'

export type InventoryGapId =
  | 'no-ingredients'
  | 'no-recipes'
  | 'no-reorder-levels'
  | 'alerts-off'
  | 'auto-86-off'

export interface InventoryGap {
  id: InventoryGapId
  title: string
  detail: string
  /** A merchant can fix this themselves; the rest need superadmin. */
  isSelfServe: boolean
}

export interface InventoryFlags {
  lowStockAlertsEnabled: boolean
  auto86Enabled: boolean
}

export interface InventoryHealth {
  ingredients: { total: number; ok: number; low: number; out: number }
  dishes: { total: number; withRecipe: number; autoHidden: number }
  gaps: InventoryGap[]
}

export interface InventoryHealthInput {
  ingredients: readonly StockLevelInput[]
  coverage: readonly RecipeCoverageRow[]
  autoHiddenCount: number
  flags: InventoryFlags
}

const GAPS: Record<InventoryGapId, Omit<InventoryGap, 'id'>> = {
  'no-ingredients': {
    title: 'No ingredients yet',
    detail:
      'Nothing is being tracked, so nothing can be deducted, run low, or hide a dish. Add what you buy on the Ingredients tab.',
    isSelfServe: true,
  },
  'no-recipes': {
    title: 'No dish has a recipe',
    detail:
      'Orders will not move your stock at all until at least one dish says what it uses. Set one up on the Recipes tab.',
    isSelfServe: true,
  },
  'no-reorder-levels': {
    title: 'No reorder levels set',
    detail:
      'Low-stock warnings compare against a reorder level, and every ingredient is still at zero — so nothing will ever be called low. Running out is still detected.',
    isSelfServe: true,
  },
  'alerts-off': {
    title: 'Low-stock alerts are off',
    detail:
      'Stock is tracked and deducted, but you will not be warned before an ingredient runs out. Ask support to switch alerts on.',
    isSelfServe: false,
  },
  'auto-86-off': {
    title: 'Auto-hide is off',
    detail:
      'A dish stays orderable after its ingredients run out, so you will need to hide it yourself. Ask support to switch auto-hide on.',
    isSelfServe: false,
  },
}

function gap(id: InventoryGapId): InventoryGap {
  return { id, ...GAPS[id] }
}

/**
 * A whole-system verdict from what the page already loaded.
 *
 * Archived ingredients are excluded everywhere: they are not on the shelf, and
 * counting them would make a cleaned-up tenant look stocked.
 */
export function summarizeInventoryHealth({
  ingredients,
  coverage,
  autoHiddenCount,
  flags,
}: InventoryHealthInput): InventoryHealth {
  const active = ingredients.filter((item) => item.is_active)

  const counts = { total: active.length, ok: 0, low: 0, out: 0 }
  for (const item of active) counts[evaluateStockLevel(item)] += 1

  const withRecipe = coverage.filter((row) => row.hasRecipe).length

  // An empty shelf makes every other gap unreachable rather than merely also
  // true — listing them alongside would bury the one thing to do first.
  if (active.length === 0) {
    return {
      ingredients: counts,
      dishes: { total: coverage.length, withRecipe, autoHidden: autoHiddenCount },
      gaps: [gap('no-ingredients')],
    }
  }

  const gaps: InventoryGap[] = []
  if (coverage.length > 0 && withRecipe === 0) gaps.push(gap('no-recipes'))
  if (active.every((item) => item.reorder_level <= 0)) gaps.push(gap('no-reorder-levels'))
  if (!flags.lowStockAlertsEnabled) gaps.push(gap('alerts-off'))
  if (!flags.auto86Enabled) gaps.push(gap('auto-86-off'))

  return {
    ingredients: counts,
    dishes: { total: coverage.length, withRecipe, autoHidden: autoHiddenCount },
    gaps,
  }
}
