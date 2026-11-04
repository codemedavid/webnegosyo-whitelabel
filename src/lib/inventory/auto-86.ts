/**
 * Auto-86: which dishes come off the menu, and which come back, given the
 * shelf as it stands.
 *
 * Pure, like `low-stock.ts` — the decision of what to take off the menu is
 * separable from the act of taking it off (`auto-86-service.ts`), and only the
 * pure half is worth testing exhaustively.
 *
 * **It decides on the LEVEL, not the crossing** (2026-11-03). The first
 * version hid a dish only on the movement that carried an ingredient INTO
 * "out". An ingredient already out never crossed again, so a dish a person
 * turned back on over an empty shelf stayed on sale forever while the shelf
 * went negative — the Lolys Egg incident. Like Lavu's "track 86 by inventory
 * level", every stock change now asks of each affected dish: can one serving
 * be made? No → off. A dish this system hid, yes again → back on.
 *
 * "Can one serving be made" is the checkout's own arithmetic
 * (`resolveProducibleUnits`, base recipe, unit conversion, portion size), so a
 * dish is never on the menu while checkout would refuse it, or hidden while
 * checkout would sell it. An ingredient left OFF the shelf the caller hands in
 * — never counted, inactive, unconvertible — has no opinion, exactly as there.
 *
 * **Only a base recipe can 86 an item.** An ingredient used solely by a
 * variation option, modifier option, or addon leaves the item sellable in its
 * other configurations, and pulling the whole item would cost the merchant
 * sales they could still have made. The narrower fix — disabling just the
 * option — needs per-option availability that does not exist yet.
 *
 * There is deliberately no cascade through prep items: a prep item is stocked
 * in its own right and depletes as an ordinary component, so when it runs out
 * it arrives here as an out-of-stock ingredient on its own account.
 */

import { resolveProducibleUnits, type ProducibleStock } from '@/lib/inventory/producible'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { Recipe, RecipeComponent } from '@/types/database'

/** The slice of a menu item the decision depends on. */
export interface Auto86Dish {
  id: string
  is_available: boolean
  /** Set when THIS system took the dish off; only those are ever put back. */
  auto_disabled_at: string | null
  /** "Sell anyway" until this instant: the owner overrode an empty reading. */
  auto_86_snoozed_until: string | null
}

export interface Auto86Decision {
  /** Dishes to take off the menu, in input order. */
  disable: string[]
  /** Dishes this system hid that can be made again, in input order. */
  reEnable: string[]
}

function isSnoozed(dish: Auto86Dish, nowMs: number): boolean {
  if (!dish.auto_86_snoozed_until) return false
  const until = Date.parse(dish.auto_86_snoozed_until)
  return Number.isFinite(until) && until > nowMs
}

/**
 * What to do with each dish, given its base recipe and the judged shelf.
 *
 * `recipes` may hold any recipes; only base (`menu_item`) recipes are read, so
 * an ingredient only an option or add-on uses never 86es the whole dish — the
 * dish is still sellable in its other configurations. `shelf` must already
 * exclude ingredients that have no opinion (never counted, unknown units).
 */
export function decideAuto86(
  dishes: readonly Auto86Dish[],
  recipes: readonly Recipe[],
  components: readonly RecipeComponent[],
  shelf: readonly ProducibleStock[],
  units: readonly InventoryUnit[],
  nowMs: number,
): Auto86Decision {
  const baseRecipes = recipes.filter((recipe) => recipe.target_type === 'menu_item' && Boolean(recipe.menu_item_id))
  const disable: string[] = []
  const reEnable: string[] = []

  for (const dish of dishes) {
    const canMake = resolveProducibleUnits({ menuItemId: dish.id }, baseRecipes, components, shelf, units)
    const cannotBeMade = canMake === 0

    if (dish.is_available) {
      if (cannotBeMade && !isSnoozed(dish, nowMs)) disable.push(dish.id)
      continue
    }
    if (dish.auto_disabled_at && !cannotBeMade) reEnable.push(dish.id)
  }

  return { disable, reEnable }
}
