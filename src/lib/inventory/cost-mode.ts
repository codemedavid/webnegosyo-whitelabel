/**
 * Cost mode — how a costable target's cost is determined.
 *
 *   'simple'    → the merchant types a number (manual cost)
 *   'composite' → the cost is rolled up from an attached inventory recipe
 *
 * The mode is the single source of truth: in `simple` mode an attached recipe
 * is ignored, and in `composite` mode a leftover manual cost is ignored. That
 * makes the editor's toggle honest — switching modes changes what the merchant
 * sees, with no hidden precedence rule.
 *
 * `undefined` is the **legacy** state: every option saved before this feature
 * existed has no mode, and must keep behaving exactly as `resolveOptionCost`
 * did (an attached recipe cost overrides the manual cost). Keeping that branch
 * here — rather than backfilling on read — is what makes this change a no-op
 * for existing tenants.
 *
 * Pure module: no server imports, safe for client bundles.
 */

import type { CostMode, ModifierOption } from '@/types/database'

export type { CostMode }

/**
 * Effective cost for a target, given its mode and both candidate costs.
 * A missing cost on the chosen side is 0, never a silent fallback to the other
 * side — "composite with no recipe yet" must read as 0, not as the stale manual
 * number the merchant just stopped using.
 */
export function resolveCostByMode(
  mode: CostMode | undefined,
  manualCost: number | undefined,
  recipeCost: number | undefined,
): number {
  if (mode === 'simple') return manualCost ?? 0
  if (mode === 'composite') return recipeCost ?? 0

  // Legacy: recipe cost wins when present, else the manual cost, else 0.
  return recipeCost ?? manualCost ?? 0
}

/** Effective cost of a unified modifier option, honoring its own cost mode. */
export function resolveOptionCostForOption(
  option: Pick<ModifierOption, 'cost_mode' | 'manual_cost'>,
  recipeCost: number | undefined,
): number {
  return resolveCostByMode(option.cost_mode, option.manual_cost, recipeCost)
}
